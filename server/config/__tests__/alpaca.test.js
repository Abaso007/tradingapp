jest.mock('../../models/userModel', () => ({ findById: jest.fn() }));
const User = require('../../models/userModel');
const { setAlpaca } = require('../alpaca');
const CryptoJS = require('crypto-js');
const original = { ...process.env };
afterEach(() => { process.env = { ...original }; jest.clearAllMocks(); });
beforeEach(() => {
  process.env.ALPACA_OWNER_USER_ID = 'owner';
  process.env.ALPACA_LIVE_API_KEY_ID = 'AK-server';
  process.env.ALPACA_LIVE_API_SECRET_KEY = 'server-secret';
  delete process.env.ALPACA_API_KEY_ID;
  delete process.env.ALPACA_API_SECRET_KEY;
});
it('does not give server live credentials to another registered user', async () => {
  User.findById.mockResolvedValue({});
  expect((await setAlpaca('other', 'live')).hasValidKeys).toBe(false);
  expect((await setAlpaca('owner', 'live')).keyId).toBe('AK-server');
});
it('prefers a complete user pair and never mixes one missing half with server credentials', async () => {
  User.findById.mockResolvedValue({ ALPACA_LIVE_API_KEY_ID: 'AK-own', ALPACA_LIVE_API_SECRET_KEY: 'own-secret' });
  expect((await setAlpaca('owner', 'live')).keyId).toBe('AK-own');
  User.findById.mockResolvedValue({ ALPACA_LIVE_API_KEY_ID: 'AK-own' });
  expect((await setAlpaca('owner', 'live')).hasValidKeys).toBe(false);
});
it('decrypts keys encrypted with the Settings fallback key', async () => {
  delete process.env.ENCRYPTION_KEY;
  process.env.CryptoJS_secret_key = 'test-encryption-key';
  User.findById.mockResolvedValue({ ALPACA_LIVE_API_KEY_ID: CryptoJS.AES.encrypt('AK-own', 'test-encryption-key').toString(), ALPACA_LIVE_API_SECRET_KEY: CryptoJS.AES.encrypt('secret', 'test-encryption-key').toString() });
  expect((await setAlpaca('owner', 'live')).keyId).toBe('AK-own');
});
