const { randomUUID } = require('crypto');
const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected']);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const headersFor = (keys) => ({ 'APCA-API-KEY-ID': keys.keyId, 'APCA-API-SECRET-KEY': keys.secretKey });
const brokerError = (error) => ({
  status: error?.response?.status || null,
  code: error?.response?.data?.code || error?.code || null,
  message: String(error?.response?.data?.message || error?.message || 'Broker request failed').slice(0, 1000),
});
const clone = (value) => JSON.parse(JSON.stringify(value));

const save = async (portfolio, assertOwned) => {
  await assertOwned();
  portfolio.markModified?.('executionJournal');
  await portfolio.save();
};

const beginJournal = async (portfolio, assertOwned) => {
  if (portfolio.executionJournal && !portfolio.executionJournal.committed) {
    throw new Error('Previous order journal must be reconciled first');
  }
  portfolio.executionJournal = {
    id: randomUUID(), startedAt: new Date().toISOString(), committed: false,
    baseline: { stocks: clone(portfolio.stocks || []), cash: Number(portfolio.retainedCash || 0), realized: Number(portfolio.realizedPnlValue || 0) },
    orders: [],
  };
  await save(portfolio, assertOwned);
};

// Replay cumulative broker fills from a fixed baseline, rather than incrementing
// again after a crash. The journal and its accounting effects share one document.
const applyJournal = (portfolio) => {
  const journal = portfolio.executionJournal;
  const holdings = new Map(journal.baseline.stocks.map((stock) => [stock.symbol, { ...stock }]));
  let cash = journal.baseline.cash;
  let realized = journal.baseline.realized;
  for (const order of journal.orders) {
    const qty = Number(order.filledQty || 0);
    if (!qty) continue;
    const price = Number(order.filledPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error('Executed order has no valid fill price');
    const stock = holdings.get(order.symbol) || { symbol: order.symbol, quantity: 0, avgCost: 0 };
    if (order.side === 'sell') {
      if (qty > stock.quantity + 0.000001) throw new Error('Fill exceeds strategy-owned position');
      realized += qty * (price - stock.avgCost);
      stock.quantity = Math.max(0, stock.quantity - qty);
      cash += qty * price;
    } else {
      stock.avgCost = (stock.quantity * stock.avgCost + qty * price) / (stock.quantity + qty);
      stock.quantity += qty;
      stock.orderID = order.brokerId;
      cash -= qty * price;
    }
    stock.currentPrice = price;
    holdings.set(order.symbol, stock);
  }
  portfolio.stocks = Array.from(holdings.values()).filter((s) => s.quantity > 0.0000001);
  portfolio.retainedCash = cash;
  portfolio.cashBuffer = cash;
  portfolio.realizedPnlValue = realized;
};

const remember = (entry, data) => {
  if (!data?.id || typeof data?.status !== 'string') throw new Error('Malformed broker order response');
  const filledQty = Number(data.filled_qty);
  if (!Number.isFinite(filledQty) || filledQty < 0 || filledQty > Number(entry.qty) + 0.000001) {
    throw new Error('Malformed broker filled quantity');
  }
  if (data.client_order_id && data.client_order_id !== entry.clientId) throw new Error('Order identifier mismatch');
  const price = Number(data.filled_avg_price);
  if (filledQty > 0 && (!Number.isFinite(price) || price <= 0)) throw new Error('Malformed broker fill price');
  if (data.status === 'filled' && Math.abs(filledQty - Number(entry.qty)) > .000001) throw new Error('Filled order quantity mismatch');
  entry.brokerId = data.id;
  entry.status = data.status;
  entry.filledQty = filledQty;
  entry.filledPrice = filledQty > 0 ? Number(data.filled_avg_price) : null;
  entry.terminal = TERMINAL.has(data.status);
};

const refreshOrder = async (keys, entry) => {
  const url = entry.brokerId ? `/v2/orders/${encodeURIComponent(entry.brokerId)}` : '/v2/orders:by_client_order_id';
  const { data } = await keys.client.get(`${keys.apiUrl}${url}`, {
    headers: headersFor(keys),
    ...(!entry.brokerId ? { params: { client_order_id: entry.clientId } } : {}),
  });
  remember(entry, data);
};

const recoverJournal = async (portfolio, keys, assertOwned) => {
  const journal = portfolio.executionJournal;
  if (!journal || journal.committed) return true;
  for (const entry of journal.orders) {
    if (!entry.terminal) {
      try { await refreshOrder(keys, entry); }
      catch (error) { entry.error = brokerError(error); }
    }
  }
  applyJournal(portfolio);
  const complete = journal.orders.every((entry) => entry.terminal);
  if (complete) journal.committed = true;
  await save(portfolio, assertOwned);
  return complete;
};

const executeOrder = async (portfolio, keys, payload, assertOwned, { attempts = 6, pollMs = 750 } = {}) => {
  const journal = portfolio.executionJournal;
  const clientId = `ta-${journal.id.slice(0, 24)}-${journal.orders.length}`;
  const entry = { symbol: payload.symbol, side: payload.side, qty: Number(payload.qty), clientId, status: 'submitting', filledQty: 0, terminal: false };
  journal.orders.push(entry);
  // A durable intent MUST exist before any POST. Never automatically repost an
  // ambiguous timeout; recovery searches the same client id on subsequent runs.
  await save(portfolio, assertOwned);
  try {
    await assertOwned();
    const { data } = await keys.client.post(`${keys.apiUrl}/v2/orders`, { ...payload, client_order_id: clientId }, { headers: headersFor(keys) });
    remember(entry, data);
  } catch (error) {
    entry.error = brokerError(error);
    const status = Number(error?.response?.status);
    if ([400, 401, 403, 422].includes(status) && !String(entry.error.message).toLowerCase().includes('client_order_id')) {
      entry.status = 'rejected';
      entry.terminal = true;
    }
  }
  for (let attempt = 0; !entry.terminal && attempt < attempts; attempt += 1) {
    if (attempt) await wait(pollMs);
    try { await refreshOrder(keys, entry); }
    catch (error) { entry.error = brokerError(error); break; }
  }
  applyJournal(portfolio);
  await save(portfolio, assertOwned);
  return { ...entry, qty: entry.filledQty, price: entry.filledPrice, orderId: entry.brokerId, submittedQty: Number(payload.qty) };
};

module.exports = { beginJournal, executeOrder, recoverJournal, applyJournal, brokerError, headersFor };
