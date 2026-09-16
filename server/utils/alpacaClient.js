const axios = require('axios');

// Small REST adapter for the few legacy controller reads. Order execution for
// strategies goes through alpacaOrderJournal; do not add automatic POST retries.
class AlpacaClient {
  constructor(config) {
    const keys = config.getTradingKeys?.();
    this.baseUrl = keys?.apiUrl || config.tradingApiURL || config.apiURL;
    if (!['https://api.alpaca.markets', 'https://paper-api.alpaca.markets'].includes(this.baseUrl)) {
      throw new Error('Invalid Alpaca trading endpoint');
    }
    this.client = keys?.client || axios.create({ timeout: 15000, proxy: false, maxRedirects: 0 });
    this.headers = { 'APCA-API-KEY-ID': keys?.keyId || config.keyId, 'APCA-API-SECRET-KEY': keys?.secretKey || config.secretKey };
  }
  async get(endpoint) { return (await this.client.get(`${this.baseUrl}${endpoint}`, { headers: this.headers })).data; }
  getAccount() { return this.get('/v2/account'); }
  getClock() { return this.get('/v2/clock'); }
  getAsset(symbol) { return this.get(`/v2/assets/${encodeURIComponent(symbol)}`); }
  async createOrder(order) {
    if (this.baseUrl !== 'https://paper-api.alpaca.markets') throw new Error('Live orders require the durable execution journal');
    return (await this.client.post(`${this.baseUrl}/v2/orders`, order, { headers: this.headers })).data;
  }
}
module.exports = AlpacaClient;
