const { compactStrategyLogDetails } = require('../strategyLogResponse');

describe('compactStrategyLogDetails', () => {
  it('keeps the fields the strategy logs UI needs and drops bulky debug payloads', () => {
    const details = {
      provider: 'polymarket',
      humanSummary: 'Summary',
      mode: 'incremental',
      executionMode: 'live',
      portfolioUpdated: true,
      sizeToBudget: true,
      buyCount: 3,
      sellCount: 1,
      executionDebug: {
        huge: true,
      },
      liveHoldings: [{ asset_id: 'ignore-me' }],
      sizing: {
        sizingBudget: 100,
        scale: 0.5,
        makerValue: 200,
        ignored: 'nope',
      },
      thoughtProcess: {
        summary: 'Thought summary',
        reasoning: ['one', 'two'],
        adjustments: [{ symbol: 'AAA' }],
        cashSummary: {
          cashBefore: 10,
          cashBuffer: 5,
          ignored: 99,
        },
        composerPositions: [{ symbol: 'SPY' }],
        tooling: {
          localEvaluator: {
            used: true,
            lookbackDays: 30,
            tickers: ['SPY'],
            blueprint: ['rule'],
            ignored: 'x',
          },
        },
      },
      buys: [{ symbol: 'YES' }],
      rebalance: [{ asset_id: '1' }],
      positions: [{ symbol: 'YES' }],
    };

    expect(compactStrategyLogDetails(details)).toEqual({
      provider: 'polymarket',
      humanSummary: 'Summary',
      mode: 'incremental',
      executionMode: 'live',
      portfolioUpdated: true,
      sizeToBudget: true,
      buyCount: 3,
      sellCount: 1,
      thoughtProcess: {
        summary: 'Thought summary',
        reasoning: ['one', 'two'],
        adjustments: [{ symbol: 'AAA' }],
        cashSummary: {
          cashBefore: 10,
          cashBuffer: 5,
        },
        composerPositions: [{ symbol: 'SPY' }],
        tooling: {
          localEvaluator: {
            used: true,
            lookbackDays: 30,
            tickers: ['SPY'],
            blueprint: ['rule'],
          },
        },
      },
      sizing: {
        sizingBudget: 100,
        scale: 0.5,
        makerValue: 200,
      },
      buys: [{ symbol: 'YES' }],
      rebalance: [{ asset_id: '1' }],
      positions: [{ symbol: 'YES' }],
    });
  });

  it('caps large arrays to keep strategy log responses bounded', () => {
    const buys = Array.from({ length: 8 }, (_, index) => ({ symbol: `B${index}` }));
    const positions = Array.from({ length: 6 }, (_, index) => ({ symbol: `P${index}` }));

    const result = compactStrategyLogDetails(
      {
        buys,
        positions,
      },
      {
        maxTradeItems: 3,
        maxPositionItems: 2,
      }
    );

    expect(result).toEqual({
      buys: buys.slice(0, 3),
      positions: positions.slice(0, 2),
    });
  });
});
