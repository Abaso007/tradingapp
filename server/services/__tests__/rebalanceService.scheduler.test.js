const previousConcurrency = process.env.REBALANCE_MAX_CONCURRENCY;
process.env.REBALANCE_MAX_CONCURRENCY = '2';

jest.mock('../../models/portfolioModel', () => ({
  find: jest.fn(),
}));

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
  recordStrategyLog: jest.fn(async () => {}),
}));

jest.mock('../alpacaExecutionService', () => ({
  getEnvAlpacaExecutionMode: jest.fn(() => 'paper'),
  normalizeExecutionModeOverride: jest.fn((value) => value),
}));

jest.mock('../../utils/openaiComposerStrategy', () => ({
  runComposerStrategy: jest.fn(),
}));

jest.mock('../../utils/composerLinkClient', () => ({
  parseSymphonyIdFromUrl: jest.fn(),
  fetchPublicSymphonyDetailsById: jest.fn(),
  fetchPublicSymphonyBacktestById: jest.fn(),
  computeLastUsMarketCloseDateKey: jest.fn(),
  extractBacktestWeightsForDay: jest.fn(),
}));

jest.mock('../polymarketCopyService', () => ({
  syncPolymarketPortfolio: jest.fn(),
}));

const Portfolio = require('../../models/portfolioModel');
const { syncPolymarketPortfolio } = require('../polymarketCopyService');
const { runDueRebalances, resetRebalanceLock } = require('../rebalanceService');

describe('runDueRebalances scheduler concurrency', () => {
  afterAll(() => {
    if (previousConcurrency === undefined) {
      delete process.env.REBALANCE_MAX_CONCURRENCY;
    } else {
      process.env.REBALANCE_MAX_CONCURRENCY = previousConcurrency;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetRebalanceLock();
  });

  it('processes due portfolios up to the configured concurrency', async () => {
    const releases = new Map();
    let inflight = 0;
    let maxInflight = 0;

    syncPolymarketPortfolio.mockImplementation((portfolio) => new Promise((resolve) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      releases.set(String(portfolio.strategy_id), () => {
        inflight -= 1;
        resolve({ ok: true });
      });
    }));

    Portfolio.find.mockReturnValue([
      { _id: 'portfolio-1', provider: 'polymarket', strategy_id: 'strategy-1', userId: 'user-1', name: 'One' },
      { _id: 'portfolio-2', provider: 'polymarket', strategy_id: 'strategy-2', userId: 'user-1', name: 'Two' },
      { _id: 'portfolio-3', provider: 'polymarket', strategy_id: 'strategy-3', userId: 'user-1', name: 'Three' },
    ]);

    const runPromise = runDueRebalances();
    await new Promise((resolve) => setImmediate(resolve));

    expect(syncPolymarketPortfolio).toHaveBeenCalledTimes(2);
    expect(maxInflight).toBe(2);

    releases.get('strategy-1')();
    await new Promise((resolve) => setImmediate(resolve));

    expect(syncPolymarketPortfolio).toHaveBeenCalledTimes(3);

    releases.get('strategy-2')();
    releases.get('strategy-3')();

    const result = await runPromise;
    expect(result.processed).toBe(3);
    expect(result.due).toBe(3);
    expect(result.concurrency).toBe(2);
  });
});
