const { fetchFreshSizingPrices } = require('../alpacaSizingPrices');
const now = Date.parse('2026-09-18T18:00:00Z');
const quote = { bp: 35.50, ap: 35.51, bs: 100, as: 100, t: '2026-09-18T17:59:59Z' };
const fixture = (q, trade) => ({ apiUrl: 'https://data.test', keyId: 'test', secretKey: 'test',
  client: { get: jest.fn(async url => url.includes('quotes/latest')
    ? { data: { quotes: { SPXU: q } } } : { data: { trade } }) } });

it('sizes from fresh IEX asks when the last exchange trade is old', async () => {
  const keys = fixture(quote, { p: 35.40, t: '2026-09-18T17:40:00Z' });
  const result = await fetchFreshSizingPrices(['SPXU'], keys, { now: () => now });
  expect(result.prices.SPXU).toBe(35.51);
  expect(result.observations.SPXU.source).toBe('quote');
  expect(keys.client.get).toHaveBeenCalledTimes(1);
});
it('uses a recent trade if quotes are unavailable', async () => {
  const keys = fixture(null, { p: 35.5, t: '2026-09-18T17:59:00Z' });
  expect((await fetchFreshSizingPrices(['SPXU'], keys, { now: () => now })).prices.SPXU).toBe(35.5);
});
it.each([
  { ...quote, t: '2026-09-18T17:50:00Z' },
  { ...quote, t: '2026-09-18T18:05:00Z' },
  { ...quote, ap: 0 },
  { ...quote, bp: 36 },
  { ...quote, as: 0 },
  { ...quote, ap: Infinity },
])('rejects stale, malformed or untradeable quotes with no fresh trade', async q => {
  const keys = fixture(q, { p: 35.5, t: '2026-09-18T17:40:00Z' });
  await expect(fetchFreshSizingPrices(['SPXU'], keys, { now: () => now })).rejects.toThrow('Fresh market data unavailable');
});
