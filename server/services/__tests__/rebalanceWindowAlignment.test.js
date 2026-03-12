describe('rebalance window alignment', () => {
  const originalWindowMinutes = process.env.REBALANCE_WINDOW_MINUTES;

  afterEach(() => {
    if (originalWindowMinutes === undefined) {
      delete process.env.REBALANCE_WINDOW_MINUTES;
    } else {
      process.env.REBALANCE_WINDOW_MINUTES = originalWindowMinutes;
    }
    jest.resetModules();
  });

  it('defaults to a 120 minute window before close', () => {
    delete process.env.REBALANCE_WINDOW_MINUTES;
    jest.resetModules();

    const { computeRebalanceWindow } = require('../rebalanceService');

    const close = new Date('2026-01-06T21:00:00.000Z');
    const window = computeRebalanceWindow(close);
    expect(window.minutes).toBe(120);
    expect(window.start.toISOString()).toBe('2026-01-06T19:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-01-06T21:00:00.000Z');
  });

  it('anchors to window start when requested', async () => {
    process.env.REBALANCE_WINDOW_MINUTES = '60';
    jest.resetModules();

    const { alignToRebalanceWindowStart } = require('../rebalanceService');

    const tradingKeys = {
      apiUrl: 'https://paper-api.alpaca.markets',
      keyId: 'test-key',
      secretKey: 'test-secret',
      client: {
        get: jest.fn().mockResolvedValue({
          data: [{ date: '2026-01-06', open: '09:30', close: '16:00' }],
        }),
      },
    };

    const desired = new Date('2026-01-06T20:30:00.000Z');
    const anchored = await alignToRebalanceWindowStart(tradingKeys, desired, { anchor: 'start' });
    expect(anchored.toISOString()).toBe('2026-01-06T20:00:00.000Z');

    const preserved = await alignToRebalanceWindowStart(tradingKeys, desired);
    expect(preserved.toISOString()).toBe('2026-01-06T20:30:00.000Z');
  });

  it('anchors daily automatic schedules to the target trading day pre-close slot', async () => {
    delete process.env.REBALANCE_WINDOW_MINUTES;
    jest.resetModules();

    const { alignToAutomaticRebalanceSlot } = require('../rebalanceService');

    const tradingKeys = {
      apiUrl: 'https://paper-api.alpaca.markets',
      keyId: 'test-key',
      secretKey: 'test-secret',
      client: {
        get: jest.fn().mockResolvedValue({
          data: [{ date: '2026-03-12', open: '09:30', close: '16:00' }],
        }),
      },
    };

    const desired = new Date('2026-03-12T21:00:00.000Z');
    const scheduled = await alignToAutomaticRebalanceSlot(tradingKeys, 'daily', desired);
    expect(scheduled.toISOString()).toBe('2026-03-12T18:00:00.000Z');
  });
});
