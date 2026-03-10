const { getPortfolioProvider } = require('../portfolioProvider');

describe('getPortfolioProvider', () => {
  it('returns the explicit provider when present', () => {
    expect(getPortfolioProvider({ provider: 'polymarket' })).toBe('polymarket');
    expect(getPortfolioProvider({ provider: 'alpaca' })).toBe('alpaca');
  });

  it('infers polymarket from polymarket metadata on legacy portfolios', () => {
    expect(
      getPortfolioProvider({
        provider: '',
        polymarket: {
          address: '0x1234',
          sizeToBudget: false,
        },
      })
    ).toBe('polymarket');
  });

  it('infers polymarket from legacy holdings shape when provider is missing', () => {
    expect(
      getPortfolioProvider({
        stocks: [
          {
            symbol: 'Trump wins',
            asset_id: '123',
            outcome: 'YES',
          },
        ],
      })
    ).toBe('polymarket');
  });

  it('falls back to alpaca when no polymarket signal is present', () => {
    expect(
      getPortfolioProvider({
        name: 'Momentum',
        stocks: [{ symbol: 'SPY', quantity: 2 }],
      })
    ).toBe('alpaca');
  });
});
