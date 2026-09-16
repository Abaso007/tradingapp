const { headersFor } = require('./alpacaOrderJournal');

// Read-only broker reconciliation. An explicit universe and inception date are
// required; personal positions are never inferred to belong to a strategy.
const collectActivities = async (keys, after) => {
  const rows = [];
  const ids = new Set();
  let pageToken;
  for (let page = 0; page < 1000; page += 1) {
    const { data } = await keys.client.get(`${keys.apiUrl}/v2/account/activities`, {
      headers: headersFor(keys), params: { after, direction: 'asc', page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
    });
    if (!Array.isArray(data)) throw new Error('Invalid activity response');
    for (const row of data) {
      if (!row.id || ids.has(row.id)) throw new Error('Activity pagination did not advance');
      ids.add(row.id); rows.push(row);
    }
    if (data.length < 100) return rows;
    pageToken = data.at(-1).id;
  }
  throw new Error('Activity pagination incomplete');
};

const reconcileActivities = ({ activities, positions, universe, includeAccountFees = false }) => {
  const allowed = new Set(universe);
  const quantities = new Map();
  let buys = 0, sells = 0, dividends = 0, tradingFees = 0, fundingFees = 0;
  const ledger = [];
  const unallocated = [];
  const outsideFills = activities.some((a) => a.activity_type === 'FILL' && !allowed.has(a.symbol));
  for (const row of activities) {
    if (row.activity_type === 'FILL' && allowed.has(row.symbol)) {
      const qty = Number(row.qty), price = Number(row.price);
      if (!(qty > 0) || !(price > 0) || !['buy', 'sell'].includes(row.side)) throw new Error('Malformed fill activity');
      const buy = row.side === 'buy';
      quantities.set(row.symbol, (quantities.get(row.symbol) || 0) + (buy ? qty : -qty));
      if (buy) buys += qty * price; else sells += qty * price;
      ledger.push({ id: row.id, type: 'fill', symbol: row.symbol, side: row.side, qty, price, orderId: row.order_id, at: row.transaction_time });
    } else if (['DIV', 'DIVNRA'].includes(row.activity_type) && allowed.has(row.symbol)) {
      const amount = Number(row.net_amount);
      if (!Number.isFinite(amount)) throw new Error('Malformed dividend');
      dividends += amount;
      ledger.push({ id: row.id, type: 'dividend', symbol: row.symbol, amount, at: row.date });
    } else if (row.activity_type === 'FEE') {
      const amount = Number(row.net_amount);
      if (!Number.isFinite(amount)) throw new Error('Malformed fee');
      if (!includeAccountFees || outsideFills) { unallocated.push(row.id); continue; }
      const funding = /funding|conversion/i.test(row.description || '');
      if (funding) fundingFees += amount; else tradingFees += amount;
      ledger.push({ id: row.id, type: funding ? 'funding_fee' : 'trading_fee', amount, at: row.date });
    } else if (allowed.has(row.symbol) && !['FILL', 'DIV', 'DIVNRA'].includes(row.activity_type)) {
      throw new Error(`Corporate action ${row.activity_type} requires explicit reconciliation`);
    }
  }
  const holdings = positions.filter((p) => allowed.has(p.symbol));
  for (const symbol of allowed) {
    const qty = holdings.filter((p) => p.symbol === symbol).reduce((n, p) => n + Number(p.qty), 0);
    if (Math.abs(qty - (quantities.get(symbol) || 0)) > .000002) throw new Error(`Activity/position mismatch for ${symbol}`);
  }
  const costBasis = holdings.reduce((n, p) => n + Number(p.cost_basis), 0);
  const marketValue = holdings.reduce((n, p) => n + Number(p.market_value), 0);
  if (![costBasis, marketValue].every(Number.isFinite)) throw new Error('Invalid broker valuation');
  const grossRealized = sells - buys + costBasis;
  return { ledger, unallocated, holdings, buys, sells, costBasis, marketValue, grossRealized,
    dividends, tradingFees, fundingFees, netRealized: grossRealized + dividends + tradingFees + fundingFees,
    netPnl: sells - buys + marketValue + dividends + tradingFees + fundingFees };
};

const syncLedger = async (portfolio, keys, { persistEntries = true } = {}) => {
  const config = portfolio.accounting;
  if (!config?.activityStart || !Array.isArray(config.universe)) return null;
  const activities = await collectActivities(keys, config.activityStart);
  const [positions, account, orders] = await Promise.all([
    keys.client.get(`${keys.apiUrl}/v2/positions`, { headers: headersFor(keys) }),
    keys.client.get(`${keys.apiUrl}/v2/account`, { headers: headersFor(keys) }),
    keys.client.get(`${keys.apiUrl}/v2/orders`, { headers: headersFor(keys), params: { status: 'open', limit: 500 } }),
  ]);
  if (!Array.isArray(orders.data) || orders.data.length) throw new Error('Ledger reconciliation requires no open orders');
  if (!Array.isArray(positions.data)) throw new Error('Invalid positions');
  const result = reconcileActivities({ activities, positions: positions.data, universe: config.universe, includeAccountFees: config.includeAccountFees });
  if (persistEntries && result.ledger.length) {
    const mongoose = require('mongoose');
    await mongoose.connection.collection('strategyLedger').bulkWrite(result.ledger.map((entry) => ({
      updateOne: { filter: { _id: `${portfolio.strategy_id}:${entry.id}` },
        update: { $setOnInsert: { ...entry, strategyId: portfolio.strategy_id, userId: String(portfolio.userId) } }, upsert: true },
    })));
  }
  // Cash is a spending ceiling, not a claim that all shared-account money is ours.
  const brokerCash = Number(account.data?.cash);
  if (!Number.isFinite(brokerCash)) throw new Error('Invalid account cash');
  portfolio.retainedCash = Math.min(Math.max(0, Number(portfolio.retainedCash || 0)), Math.max(0, brokerCash));
  portfolio.cashBuffer = portfolio.retainedCash;
  portfolio.stocks = result.holdings.map((p) => ({ symbol: p.symbol, quantity: Number(p.qty), avgCost: Number(p.avg_entry_price), currentPrice: Number(p.current_price),
    orderID: [...result.ledger].reverse().find((e) => e.symbol === p.symbol && e.side === 'buy')?.orderId || `reconciled-${p.symbol}` }));
  portfolio.realizedPnlValue = result.netRealized;
  portfolio.pnlValue = result.netPnl;
  portfolio.pnlPercent = config.capitalVerified && Number(config.netContributions) > 0 ? result.netPnl / config.netContributions * 100 : null;
  portfolio.currentValue = result.marketValue;
  portfolio.accounting = { ...config, reconciledAt: new Date().toISOString(), grossRealized: result.grossRealized,
    dividends: result.dividends, tradingFees: result.tradingFees, fundingFees: result.fundingFees, unallocatedActivityIds: result.unallocated };
  portfolio.markModified?.('accounting');
  return result;
};
module.exports = { collectActivities, reconcileActivities, syncLedger };
