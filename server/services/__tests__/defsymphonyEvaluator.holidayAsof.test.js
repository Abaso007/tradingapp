jest.mock('../priceCacheService', () => ({
  getCachedPrices: jest.fn(),
  normalizeAdjustment: (value) => value,
  fetchLatestPrice: jest.fn(),
}));

const { evaluateDefsymphonyStrategy } = require('../defsymphonyEvaluator');
const { getCachedPrices } = require('../priceCacheService');

const buildBarsEndingOn = ({ endDayKey, length, startPrice, dailyReturn }) => {
  const end = new Date(`${endDayKey}T00:00:00.000Z`);
  const millisPerDay = 24 * 60 * 60 * 1000;
  const bars = [];
  let price = startPrice;
  for (let idx = 0; idx < length; idx += 1) {
    const date = new Date(end.getTime() - (length - 1 - idx) * millisPerDay);
    const rounded = Number(price.toFixed(8));
    bars.push({
      t: date.toISOString(),
      o: rounded,
      h: rounded,
      l: rounded,
      c: rounded,
      v: 1000,
    });
    price *= 1 + dailyReturn;
  }
  return { bars };
};

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
};

describe('evaluateDefsymphonyStrategy (holiday-aware previous-close)', () => {
  beforeEach(() => {
    getCachedPrices.mockReset();
  });

  it('skips US market holidays when resolving previous-close effective date', async () => {
    // Feb 16, 2026 is Presidents Day (NYSE holiday). The last completed close prior to
    // Feb 17, 2026 (before close) should therefore be Feb 13, 2026.
    getCachedPrices.mockImplementation(async ({ symbol }) => {
      if (String(symbol || '').toUpperCase() !== 'SPY') {
        throw new Error(`Unexpected symbol ${symbol}`);
      }
      return buildBarsEndingOn({
        endDayKey: '2026-02-13',
        length: 120,
        startPrice: 100,
        dailyReturn: 0,
      });
    });

    const strategy = `
      (defsymphony "Holiday As-Of Test" {}
        (weight-equal
          [
            (asset "SPY")
          ]))
    `;

    const result = await evaluateDefsymphonyStrategy({
      strategyText: strategy,
      budget: 10000,
      // 2026-02-17 10:00 ET (before close).
      asOfDate: '2026-02-17T15:00:00.000Z',
      asOfMode: 'previous-close',
      priceSource: 'tiingo',
      dataAdjustment: 'all',
      priceRefresh: false,
      requireAsOfDateCoverage: true,
    });

    expect(result.positions.map((pos) => pos.symbol)).toEqual(['SPY']);
    expect(toDateKey(result.meta?.localEvaluator?.asOfDate)).toBe('2026-02-13');
  });
});

