const { decryptIfEncrypted: decryptKey } = require('../utils/secretUtils');
const User = require("../models/userModel");
const Axios = require('axios');

const ENABLE_ALPACA_HTTP_DEBUG =
  String(process.env.ALPACA_HTTP_DEBUG ?? '').trim().toLowerCase() === 'true';

const ENABLE_ALPACA_CONFIG_DEBUG =
  String(process.env.ALPACA_CONFIG_DEBUG ?? '').trim().toLowerCase() === 'true';

// Create a custom Axios instance for Alpaca API calls
const createAlpacaClient = (config) => {
  const client = Axios.create({
    proxy: false,
    // Give Alpaca a bit more time before timing out to reduce spurious failures on slower networks.
    timeout: 15000,
  });

  if (ENABLE_ALPACA_HTTP_DEBUG) {
    // Add request interceptor for detailed logging (never log secrets/keys).
    client.interceptors.request.use(
      (reqConfig) => {
        console.log('[Alpaca HTTP] Request', {
          method: String(reqConfig.method || '').toUpperCase(),
          url: reqConfig.url,
        });
        return reqConfig;
      },
      (error) => {
        console.error('[Alpaca HTTP] Request Error', error?.message || error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for detailed error logging.
    client.interceptors.response.use(
      (response) => {
        console.log('[Alpaca HTTP] Response', {
          status: response.status,
          statusText: response.statusText,
        });
        return response;
      },
      (error) => {
        if (error.response) {
          console.error('[Alpaca HTTP] Error Response', {
            status: error.response.status,
            statusText: error.response.statusText,
          });
        } else if (error.request) {
          console.error('[Alpaca HTTP] Error Request', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
            method: error.config?.method,
          });
        } else {
          console.error('[Alpaca HTTP] Error', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  return client;
};

// Main function to set up Alpaca configuration
const setAlpaca = async (userId, forceMode = null) => {
  try {
    // A complete user-owned pair takes precedence. Never combine credentials
    // from different accounts, or lend the server account to another user.
    const owner = String(process.env.ALPACA_OWNER_USER_ID || '').trim();
    const user = userId ? await User.findById(userId) : null;
    if (userId && !user) throw new Error('Alpaca account owner not found');
    const mayUseServerKeys = !userId || (owner && String(userId) === owner);
    const pair = (idField, secretField) => {
      if (user?.[idField] || user?.[secretField]) {
        if (!user[idField] || !user[secretField]) throw new Error('Incomplete user Alpaca key pair');
        return [decryptKey(user[idField]), decryptKey(user[secretField])];
      }
      return mayUseServerKeys
        ? [decryptKey(process.env[idField]), decryptKey(process.env[secretField])]
        : [null, null];
    };
    const [paperKeyId, paperSecretKey] = pair('ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY');
    const [liveKeyId, liveSecretKey] = pair('ALPACA_LIVE_API_KEY_ID', 'ALPACA_LIVE_API_SECRET_KEY');

    // Define API URLs
    const paperApiUrl = "https://paper-api.alpaca.markets";
    const liveApiUrl = "https://api.alpaca.markets";
    const dataApiUrl = "https://data.alpaca.markets";

    // Validate paper trading keys
    const hasValidPaperKeys = paperKeyId && paperSecretKey;
    if (hasValidPaperKeys) {
      console.log('[API Info] Paper trading keys are present');
    } else {
      console.log('[API Warning] Paper trading keys are missing');
    }

    // Validate live trading keys
    const hasValidLiveKeys = liveKeyId && liveKeyId.startsWith('AK');
    if (hasValidLiveKeys) {
      console.log('[API Info] Live trading key format is valid (starts with AK)');
    } else {
      console.log('[API Warning] Live trading key format is invalid or missing');
    }

    // Treat presence of keys as valid to avoid blocking on upstream validation.
    const paperKeysValid = Boolean(paperKeyId && paperSecretKey);
    const liveKeysValid = Boolean(liveKeyId && liveSecretKey);

    // Log final configuration
    console.log('[API Info] Final configuration:');
    console.log('[API Info] - Paper trading keys valid:', paperKeysValid);
    console.log('[API Info] - Live trading keys valid:', liveKeysValid);
    console.log('[API Info] - Trading API URL:', paperApiUrl);
    console.log('[API Info] - Data API URL:', dataApiUrl);

    // Create Axios instances for trading and data APIs
    const tradingClient = createAlpacaClient();
    const dataClient = createAlpacaClient();

    const normalizeMode = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (raw === 'paper') return 'paper';
      if (raw === 'live') return 'live';
      return null;
    };

    const resolveTradingKeys = (mode = forceMode) => {
      const normalizedMode = normalizeMode(mode);
      const buildResult = (keyId, secretKey, apiUrl) => ({
        keyId,
        secretKey,
        apiUrl,
        client: tradingClient
      });

      if (normalizedMode === 'paper') {
        if (!paperKeysValid) {
          return null;
        }
        console.log('[API Info] Forcing paper trading mode');
        return buildResult(paperKeyId, paperSecretKey, paperApiUrl);
      }

      if (normalizedMode === 'live') {
        if (!liveKeysValid) {
          return null;
        }
        console.log('[API Info] Forcing live trading mode');
        return buildResult(liveKeyId, liveSecretKey, liveApiUrl);
      }

      if (paperKeysValid) {
        console.log('[API Info] Using paper trading keys for trading operations');
        return buildResult(paperKeyId, paperSecretKey, paperApiUrl);
      }

      if (liveKeysValid) {
        console.log('[API Info] Using live trading keys for trading operations (paper trading keys not valid)');
        return buildResult(liveKeyId, liveSecretKey, liveApiUrl);
      }

      return null;
    };

    const defaultTradingKeys = resolveTradingKeys(forceMode);
    if (!defaultTradingKeys) {
      const requested = normalizeMode(forceMode);
      const message =
        requested === 'paper'
          ? 'Paper trading mode requested but paper keys are missing/invalid'
          : requested === 'live'
            ? 'Live trading mode requested but live keys are missing/invalid'
            : 'No valid API keys found';

      return {
        hasValidKeys: false,
        error: message,
      };
    }

    // Return configuration with validation results
    return {
      paperKeyId,
      paperSecretKey,
      liveKeyId,
      liveSecretKey,
      paperApiUrl,
      liveApiUrl,
      dataApiUrl,
      keyId: defaultTradingKeys.keyId,
      secretKey: defaultTradingKeys.secretKey,
      apiURL: defaultTradingKeys.apiUrl,
      paper: defaultTradingKeys.apiUrl === paperApiUrl,
      tradingClient: defaultTradingKeys.client,
      hasValidPaperKeys: paperKeysValid,
      hasValidLiveKeys: liveKeysValid,
      hasValidKeys: true,
      error: null,
      getTradingKeys: (mode = forceMode) => resolveTradingKeys(mode),
      getDataKeys: () => ({
        keyId: liveKeysValid ? liveKeyId : paperKeyId,
        secretKey: liveKeysValid ? liveSecretKey : paperSecretKey,
        apiUrl: dataApiUrl,
        client: dataClient
      })
    };
  } catch (error) {
    console.error('[API Error] Error in setAlpaca:', error.message);
    return {
      hasValidKeys: false,
      error: error.message
    };
  }
};

// Export the functions
module.exports = {
  setAlpaca
};
