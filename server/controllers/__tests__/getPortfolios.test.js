jest.mock('../../services/rebalanceService', () => ({
  rebalanceNow: jest.fn(),
  isRebalanceLocked: jest.fn(() => false),
  fetchNextMarketSessionAfter: jest.fn(),
  alignToAutomaticRebalanceSlot: jest.fn(),
}));

jest.mock('../../services/polymarketCopyService', () => ({
  syncPolymarketPortfolio: jest.fn(),
  isValidHexAddress: jest.fn(() => true),
}));

jest.mock('../../services/polymarketExecutionService', () => ({
  getPolymarketExecutionMode: jest.fn(() => 'paper'),
  getPolymarketBalanceAllowance: jest.fn(),
}));

jest.mock('../../services/alpacaExecutionService', () => ({
  getEnvAlpacaExecutionMode: jest.fn(() => 'paper'),
  normalizeExecutionModeOverride: jest.fn((value) => {
    if (value == null) {
      return null;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized || null;
  }),
}));

jest.mock('../../services/equityBackfillService', () => ({
  runEquityBackfill: jest.fn(),
  TASK_NAME: 'equity-backfill',
}));

jest.mock('../../utils/progressBus', () => ({
  addSubscriber: jest.fn(),
  removeSubscriber: jest.fn(),
  publishProgress: jest.fn(),
  completeProgress: jest.fn(),
}));

jest.mock('../../services/strategyLogger', () => ({
  recordStrategyLog: jest.fn(),
}));

jest.mock('../../utils/openaiComposerStrategy', () => ({
  runComposerStrategy: jest.fn(),
}));

jest.mock('../../utils/composerLinkClient', () => ({
  fetchComposerLinkSnapshot: jest.fn(),
  fetchPublicSymphonyBacktestById: jest.fn(),
  parseSymphonyIdFromUrl: jest.fn(() => null),
}));

jest.mock('../../utils/composerHoldingsWeights', () => ({
  computeComposerHoldingsWeights: jest.fn(),
}));

jest.mock('../../utils/composerStrategySemantics', () => ({
  compareComposerStrategySemantics: jest.fn(),
}));

const mongoose = require('mongoose');
const { getPortfolios } = require('../strategiesController');

const mockRes = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

describe('getPortfolios', () => {
  let originalDb;

  beforeEach(() => {
    originalDb = mongoose.connection.db;
  });

  afterEach(() => {
    Object.defineProperty(mongoose.connection, 'db', {
      value: originalDb,
      configurable: true,
      writable: true,
    });
    jest.clearAllMocks();
  });

  it('derives lite-mode performance from holdings plus cash against the cash limit', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const usersCollection = {
      findOne: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(userId) }),
    };
    const portfoliosCollection = {
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            provider: 'polymarket',
            name: "Elon Musk's Little Friend for Real",
            strategy_id: 'pm-1',
            recurrence: 'every_minute',
            lastRebalancedAt: new Date('2026-03-19T13:07:46.000Z'),
            nextRebalanceAt: new Date('2026-03-19T14:07:46.000Z'),
            retainedCash: 49.19,
            initialInvestment: 76,
            currentValue: 50.8,
            pnlValue: -141.17,
            pnlPercent: -185.75,
            budget: 100,
            cashLimit: 100,
            stocks: [
              { quantity: 100, currentPrice: 0.508 },
            ],
            rebalanceCount: 17740,
            polymarket: {
              address: '0x689a00000000000000000000000000000000779e',
              executionMode: 'live',
              sizeToBudget: true,
              sizingState: {
                scale: 0.00435,
              },
            },
          },
        ]),
      }),
    };

    Object.defineProperty(mongoose.connection, 'db', {
      value: {
        collection: jest.fn((name) => {
          if (name === 'users') {
            return usersCollection;
          }
          if (name === 'portfolios') {
            return portfoliosCollection;
          }
          throw new Error(`Unexpected collection: ${name}`);
        }),
      },
      configurable: true,
      writable: true,
    });

    const req = {
      params: { userId },
      query: { lite: '1' },
      user: userId,
    };
    const res = mockRes();

    await getPortfolios(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.portfolios)).toBe(true);
    expect(res.body.portfolios).toHaveLength(1);

    const [portfolio] = res.body.portfolios;
    expect(portfolio.currentValue).toBeCloseTo(50.8, 2);
    expect(portfolio.cashBuffer).toBeCloseTo(49.19, 2);
    expect(portfolio.equityValue).toBeCloseTo(99.99, 2);
    expect(portfolio.performanceBaseline).toBeCloseTo(100, 2);
    expect(portfolio.performanceValue).toBeCloseTo(-0.01, 2);
    expect(portfolio.performancePercent).toBeCloseTo(-0.01, 2);

    expect(portfolio.pnlValue).toBeCloseTo(-141.17, 2);
    expect(portfolio.pnlPercent).toBeCloseTo(-185.75, 2);
    expect(portfolio.performanceValue).not.toBeCloseTo(portfolio.pnlValue, 2);
  });
});
