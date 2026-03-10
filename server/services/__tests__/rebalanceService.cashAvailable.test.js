process.env.ALPACA_ENABLE_FRACTIONAL = 'true';

jest.mock('../../models/strategyModel', () => ({
  findOne: jest.fn(),
}));

jest.mock('../../models/strategyEquitySnapshotModel', () => ({
  create: jest.fn(),
}));

jest.mock('../../config/alpacaConfig', () => ({
  getAlpacaConfig: jest.fn(),
}));

jest.mock('../strategyLogger', () => ({
  recordStrategyLog: jest.fn(),
}));

jest.mock('../../utils/openaiComposerStrategy', () => ({
  runComposerStrategy: jest.fn(),
}));

jest.mock('../polymarketCopyService', () => ({
  syncPolymarketPortfolio: jest.fn(),
}));

const Strategy = require('../../models/strategyModel');
const { getAlpacaConfig } = require('../../config/alpacaConfig');
const { rebalancePortfolio } = require('../rebalanceService');

describe('rebalancePortfolio cash gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('caps buy size when starting cash is negative', async () => {
    Strategy.findOne.mockResolvedValue({
      strategy_id: 'strategy-1',
      userId: 'user-1',
      recurrence: 'daily',
      strategy: 'not a defsymphony script',
      summary: '',
      decisions: [],
    });

    const apiUrl = 'https://alpaca.test';
    const accountCash = -1000;
    const amdPrice = 200;
    const spyPrice = 100;
    const spyQty = 10;
    const dbcPrice = 100;
    const dbcQty = 90;

    const client = {
      get: jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/v2/clock')) {
          return { data: { is_open: true } };
        }
        if (u.endsWith('/v2/positions')) {
          return {
            data: [
              { symbol: 'SPY', qty: String(spyQty), current_price: String(spyPrice) },
              { symbol: 'DBC', qty: String(dbcQty), current_price: String(dbcPrice) },
            ],
          };
        }
        if (u.endsWith('/v2/account')) {
          return { data: { cash: String(accountCash) } };
        }
        if (u.includes('/v2/orders/')) {
          return { data: { filled_avg_price: String(amdPrice), status: 'filled' } };
        }
        if (u.includes('/v2/calendar')) {
          return { data: [] };
        }
        if (u.includes('/v2/stocks/AMD/trades/latest')) {
          return { data: { trade: { p: amdPrice } } };
        }
        throw new Error(`Unexpected GET ${u}`);
      }),
      post: jest.fn(async (_url, order) => {
        return {
          data: {
            id: `${order.side}-${order.symbol}`,
            client_order_id: `${order.side}-${order.symbol}`,
          },
        };
      }),
    };

    getAlpacaConfig.mockResolvedValue({
      hasValidKeys: true,
      getTradingKeys: () => ({
        client,
        apiUrl,
        keyId: 'test-key',
        secretKey: 'test-secret',
      }),
      getDataKeys: () => ({
        client,
        apiUrl,
        keyId: 'test-key',
        secretKey: 'test-secret',
      }),
    });

    const portfolio = {
      _id: 'portfolio-1',
      userId: 'user-1',
      strategy_id: 'strategy-1',
      name: 'Test portfolio',
      provider: 'alpaca',
      recurrence: 'daily',
      nextRebalanceManual: true,
      initialInvestment: 10000,
      cashLimit: 10000,
      budget: 10000,
      retainedCash: 0,
      cashBuffer: 0,
      targetPositions: [{ symbol: 'AMD', targetWeight: 1 }],
      stocks: [
        { symbol: 'SPY', orderID: 'order-spy', avgCost: spyPrice, quantity: spyQty, currentPrice: spyPrice },
        { symbol: 'DBC', orderID: 'order-dbc', avgCost: dbcPrice, quantity: dbcQty, currentPrice: dbcPrice },
      ],
      save: jest.fn(async () => portfolio),
    };

    await rebalancePortfolio(portfolio);

    const buyOrders = client.post.mock.calls
      .map((call) => call[1])
      .filter((order) => order?.side === 'buy' && order?.symbol === 'AMD');
    expect(buyOrders).toHaveLength(1);

    expect(buyOrders[0].qty).toBe('45');
  });

  it('does not reuse depleted retained cash across rebalances and stores currentValue', async () => {
    Strategy.findOne.mockResolvedValue({
      strategy_id: 'strategy-2',
      userId: 'user-2',
      recurrence: 'daily',
      strategy: 'not a defsymphony script',
      summary: '',
      decisions: [],
    });

    const apiUrl = 'https://alpaca.test';
    const soxlPrice = 40;
    const trackedQty = 1;

    const client = {
      get: jest.fn(async (url) => {
        const u = String(url);
        if (u.endsWith('/v2/clock')) {
          return { data: { is_open: true } };
        }
        if (u.endsWith('/v2/positions')) {
          return {
            data: [
              { symbol: 'SOXL', qty: String(trackedQty), current_price: String(soxlPrice) },
            ],
          };
        }
        if (u.endsWith('/v2/account')) {
          return { data: { cash: '1000' } };
        }
        if (u.includes('/v2/orders/')) {
          return { data: { filled_avg_price: String(soxlPrice), status: 'filled' } };
        }
        if (u.includes('/v2/calendar')) {
          return { data: [] };
        }
        if (u.includes('/v2/stocks/SOXL/trades/latest')) {
          return { data: { trade: { p: soxlPrice } } };
        }
        throw new Error(`Unexpected GET ${u}`);
      }),
      post: jest.fn(async (_url, order) => {
        return {
          data: {
            id: `${order.side}-${order.symbol}-${client.post.mock.calls.length}`,
            client_order_id: `${order.side}-${order.symbol}-${client.post.mock.calls.length}`,
          },
        };
      }),
    };

    getAlpacaConfig.mockResolvedValue({
      hasValidKeys: true,
      getTradingKeys: () => ({
        client,
        apiUrl,
        keyId: 'test-key',
        secretKey: 'test-secret',
      }),
      getDataKeys: () => ({
        client,
        apiUrl,
        keyId: 'test-key',
        secretKey: 'test-secret',
      }),
    });

    const portfolio = {
      _id: 'portfolio-2',
      userId: 'user-2',
      strategy_id: 'strategy-2',
      name: 'Retained cash portfolio',
      provider: 'alpaca',
      recurrence: 'daily',
      nextRebalanceManual: true,
      initialInvestment: 50,
      cashLimit: 50,
      budget: 50,
      retainedCash: 10,
      cashBuffer: 10,
      currentValue: null,
      targetPositions: [{ symbol: 'SOXL', targetWeight: 1 }],
      stocks: [
        { symbol: 'SOXL', orderID: 'order-soxl', avgCost: soxlPrice, quantity: trackedQty, currentPrice: soxlPrice },
      ],
      save: jest.fn(async () => portfolio),
    };

    await rebalancePortfolio(portfolio);
    await rebalancePortfolio(portfolio);

    const soxlBuys = client.post.mock.calls
      .map((call) => call[1])
      .filter((order) => order?.side === 'buy' && order?.symbol === 'SOXL');

    expect(soxlBuys).toHaveLength(1);
    expect(soxlBuys[0].qty).toBe('0.250000');
    expect(portfolio.retainedCash).toBe(0);
    expect(portfolio.cashBuffer).toBe(0);
    expect(portfolio.currentValue).toBe(50);
  });
});
