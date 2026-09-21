const { headersFor } = require('./alpacaOrderJournal');

const isFresh = (timestamp, now) => {
  const age = now - Date.parse(timestamp);
  return Number.isFinite(age) && age >= -60000 && age <= 5 * 60 * 1000;
};

// IEX can update its book continuously without printing a trade for minutes.
// Use a fresh two-sided quote for sizing; ask prices conservatively size buys.
// Previous-close indicator calculations are separate and remain unchanged.
const fetchFreshSizingPrices = async (symbols, keys, { now = () => Date.now() } = {}) => {
  if (!symbols.length) return { prices: {}, observations: {} };
  const headers = headersFor(keys);
  const feed = process.env.ALPACA_DATA_FEED || 'iex';
  let quotes = {};
  try {
    const { data } = await keys.client.get(`${keys.apiUrl}/v2/stocks/quotes/latest`, {
      headers, params: { symbols: symbols.join(','), feed }, timeout: 15000,
    });
    quotes = data?.quotes || {};
  } catch (_) { /* A recent trade remains a valid alternative. */ }
  const prices = {};
  const observations = {};
  for (const symbol of symbols) {
    const quote = quotes[symbol];
    const bid = Number(quote?.bp), ask = Number(quote?.ap);
    if (isFresh(quote?.t, now()) && Number.isFinite(bid) && Number.isFinite(ask)
      && bid > 0 && ask >= bid && Number(quote?.bs) > 0 && Number(quote?.as) > 0) {
      prices[symbol] = ask;
      observations[symbol] = { source: 'quote', feed, at: quote.t, bid, ask };
      continue;
    }
    let trade;
    try {
      const { data } = await keys.client.get(`${keys.apiUrl}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`, {
        headers, params: { feed }, timeout: 15000,
      });
      trade = data?.trade;
    } catch (_) { /* Fail below without leaking request credentials. */ }
    const price = Number(trade?.p);
    if (!isFresh(trade?.t, now()) || !Number.isFinite(price) || price <= 0) {
      throw new Error(`Fresh market data unavailable for ${symbol}; execution stopped`);
    }
    prices[symbol] = price;
    observations[symbol] = { source: 'trade', feed, at: trade.t, price };
  }
  return { prices, observations };
};

module.exports = { fetchFreshSizingPrices };
