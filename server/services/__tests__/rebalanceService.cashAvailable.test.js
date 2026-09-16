process.env.ALPACA_ENABLE_FRACTIONAL = 'true';
jest.mock('../../models/strategyModel', () => ({ findOne: jest.fn(async () => ({ strategy: 'static targets' })) }));
jest.mock('../../models/portfolioModel', () => ({ findOne: jest.fn(async () => null) }));
jest.mock('../../models/strategyEquitySnapshotModel', () => ({ create: jest.fn() }));
jest.mock('../../config/alpacaConfig', () => ({ getAlpacaConfig: jest.fn() }));
jest.mock('../strategyLogger', () => ({ recordStrategyLog: jest.fn() }));
jest.mock('../../utils/openaiComposerStrategy', () => ({ runComposerStrategy: jest.fn() }));
jest.mock('../polymarketCopyService', () => ({ syncPolymarketPortfolio: jest.fn() }));
jest.mock('../brokerAccountLock', () => ({ withBrokerAccountLock: async (_k, handler) => handler(async () => {}) }));
const { getAlpacaConfig } = require('../../config/alpacaConfig');
const { recordStrategyLog } = require('../strategyLogger');
const { rebalancePortfolio } = require('../rebalanceService');
const fixture = ({ cash = 100, stocks = [], positions = [], reject = false, open = true } = {}) => {
  let brokerCash = cash;
  const brokerPositions = JSON.parse(JSON.stringify(positions));
  const client = {
    get: jest.fn(async (url) => {
      if (url.endsWith('/clock')) { if (open === null) throw new Error('clock unavailable'); return { data: { is_open: open } }; }
      if (url.endsWith('/positions')) return { data: brokerPositions };
      if (url.endsWith('/account')) return { data: { cash: brokerCash, buying_power: brokerCash } };
      if (url.endsWith('/orders') || url.includes('/calendar')) return { data: [] };
      if (url.includes('/trades/latest')) return { data: { trade: { p: 100, t: new Date().toISOString() } } };
      throw new Error(`Unexpected GET ${url}`);
    }),
    post: jest.fn(async (_url, order) => {
      if (reject) throw { response: { status: 403, data: { code: 40310000, message: 'insufficient buying power' } } };
      const qty = Number(order.qty);
      brokerCash += (order.side === 'buy' ? -1 : 1) * qty * 100;
      const position = brokerPositions.find((p) => p.symbol === order.symbol);
      if (position) position.qty = Number(position.qty) + (order.side === 'buy' ? qty : -qty);
      else brokerPositions.push({ symbol: order.symbol, qty, current_price: 100 });
      return { data: { id: `uuid-${client.post.mock.calls.length}`, client_order_id: order.client_order_id, status: 'filled', filled_qty: order.qty, filled_avg_price: '100' } };
    }),
  };
  const keys = { client, apiUrl: 'https://alpaca.test', keyId: 'test', secretKey: 'test' };
  getAlpacaConfig.mockResolvedValue({ hasValidKeys: true, paper: true, getTradingKeys: () => keys, getDataKeys: () => keys });
  const p = { _id: 'p', userId: 'u', strategy_id: 's', name: 'test', recurrence: 'daily', nextRebalanceManual: true,
    initialInvestment: 100, budget: 100, cashLimit: 100, retainedCash: Math.max(0, cash), cashBuffer: Math.max(0, cash), realizedPnlValue: 0,
    targetPositions: [{ symbol: 'SOXL', targetWeight: 1 }], stocks, save: jest.fn(async () => p), markModified: jest.fn() };
  return { p, client };
};
beforeEach(() => jest.clearAllMocks());
it('uses confirmed cash after selling and leaves an execution reserve', async () => {
  const { p, client } = fixture({ cash: -10, stocks: [{ symbol: 'SPY', quantity: 1, avgCost: 90, orderID: 'old' }], positions: [{ symbol: 'SPY', qty: 1, current_price: 100 }] });
  await rebalancePortfolio(p);
  const orders = client.post.mock.calls.map((c) => c[1]);
  expect(orders.map((o) => o.side)).toEqual(['sell', 'buy']);
  expect(Number(orders[1].qty)).toBeCloseTo(.8955);
  expect(p.realizedPnlValue).toBe(10);
  expect(p.initialInvestment).toBe(100);
});
it('does not reuse spent cash or import personal NVDA', async () => {
  const { p, client } = fixture({ positions: [{ symbol: 'NVDA', qty: .436, current_price: 200 }] });
  await rebalancePortfolio(p);
  await rebalancePortfolio(p);
  expect(client.post).toHaveBeenCalledTimes(1);
  expect(p.stocks.map((s) => s.symbol)).toEqual(['SOXL']);
  expect(p.retainedCash).toBeCloseTo(.5);
  expect(p.currentValue).toBeCloseTo(99.5);
});
it('records rejected buys as failed with broker detail and bounded retries', async () => {
  const { p, client } = fixture({ reject: true });
  await rebalancePortfolio(p);
  expect(p.executionState).toBe('failed');
  expect(p.rebalanceCount || 0).toBe(0);
  expect(p.stocks).toEqual([]);
  const log = recordStrategyLog.mock.calls.at(-1)[0];
  expect(log.message).toContain('failed');
  expect(log.details.executionErrors[0].error.message).toBe('insufficient buying power');
  expect(p.nextRebalanceAt.getTime() - Date.now()).toBeLessThan(61000);
  expect(client.post).toHaveBeenCalledTimes(1);
});
it('fails closed on unknown clock or missing broker holdings', async () => {
  const one = fixture({ open: null });
  await expect(rebalancePortfolio(one.p)).rejects.toThrow('Market clock unavailable');
  expect(one.client.post).not.toHaveBeenCalled();
  const two = fixture({ stocks: [{ symbol: 'SOXL', quantity: 1, avgCost: 90, orderID: 'old' }] });
  await expect(rebalancePortfolio(two.p)).rejects.toThrow('Position reconciliation');
  expect(two.client.post).not.toHaveBeenCalled();
});
it('closes only strategy-owned holdings after confirmed sales, keeping the record', async () => {
  const { p, client } = fixture({ cash: 0, stocks: [{ symbol: 'SOXL', quantity: 1, avgCost: 90, orderID: 'old' }], positions: [{ symbol: 'SOXL', qty: 1, current_price: 100 }, { symbol: 'NVDA', qty: .436, current_price: 200 }] });
  p.lifecycle = 'closing';
  await rebalancePortfolio(p);
  expect(p.lifecycle).toBe('closed');
  expect(p.stocks).toEqual([]);
  expect(client.post.mock.calls.map((c) => c[1].symbol)).toEqual(['SOXL']);
});
