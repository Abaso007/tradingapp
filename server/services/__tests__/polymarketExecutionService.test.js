const {
  getPolymarketExecutionMode,
  getPolymarketExecutionDebugInfo,
  executePolymarketMarketOrder,
  __testOnly,
} = require('../polymarketExecutionService');

const withEnv = async (env, fn) => {
  const original = { ...process.env };
  for (const [key, value] of Object.entries(env || {})) {
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, original);
  }
};

describe('polymarketExecutionService', () => {
  afterEach(() => {
    __testOnly.resetClobExecutionRuntimeState();
  });

  test('defaults to paper mode', () =>
    withEnv(
      {
        POLYMARKET_EXECUTION_MODE: '',
      },
      async () => {
        expect(getPolymarketExecutionMode()).toBe('paper');
      }
    ));

  test('parses live mode', () =>
    withEnv(
      {
        POLYMARKET_EXECUTION_MODE: 'live',
      },
      async () => {
        expect(getPolymarketExecutionMode()).toBe('live');
      }
    ));

  test('debug info does not throw when secrets are encrypted but ENCRYPTION_KEY is missing', () =>
    withEnv(
      {
        POLYMARKET_EXECUTION_MODE: 'live',
        POLYMARKET_PRIVATE_KEY: 'U2FsdFakeEncryptedValue',
        POLYMARKET_API_KEY: 'U2FsdFakeEncryptedValue',
        POLYMARKET_SECRET: 'U2FsdFakeEncryptedValue',
        POLYMARKET_PASSPHRASE: 'U2FsdFakeEncryptedValue',
        ENCRYPTION_KEY: '',
      },
      async () => {
        const info = getPolymarketExecutionDebugInfo();
        expect(info).toHaveProperty('decryptError');
        expect(info.decryptError).toBeTruthy();
      }
    ));

  test('market order returns dry-run payload when in paper mode', () =>
    withEnv(
      {
        POLYMARKET_EXECUTION_MODE: 'paper',
      },
      async () => {
        const result = await executePolymarketMarketOrder({
          tokenID: '123',
          side: 'BUY',
          amount: 1.23,
        });
        expect(result.ok).toBe(true);
        expect(result.dryRun).toBe(true);
        expect(result.mode).toBe('paper');
        expect(result.request).toMatchObject({
          tokenID: '123',
          side: 'BUY',
          amount: 1.23,
        });
      }
    ));

  test('serializes clob requests through a single host-level slot by default', async () => {
    const events = [];
    let releaseFirst = null;
    let secondStarted = false;

    const firstStarted = new Promise((resolve) => {
      __testOnly
        .withClobRequestSlot('https://clob.polymarket.com', async () => {
          events.push('first-start');
          resolve();
          await new Promise((resume) => {
            releaseFirst = resume;
          });
          events.push('first-end');
        })
        .catch(() => {});
    });

    await firstStarted;

    const secondTask = __testOnly.withClobRequestSlot('https://clob.polymarket.com', async () => {
      secondStarted = true;
      events.push('second-start');
      events.push('second-end');
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(secondStarted).toBe(false);

    releaseFirst();
    await secondTask;

    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });
});
