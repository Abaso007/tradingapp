const { reconcileActivities, collectActivities } = require('../alpacaLedger');
it('reconciles actual fills, dividends and fees while excluding NVDA', () => {
  const result = reconcileActivities({ universe: ['SOXL'], includeAccountFees: true,
    activities: [
      { id: 'a', activity_type: 'FILL', symbol: 'SOXL', side: 'buy', qty: '1', price: '90' },
      { id: 'b', activity_type: 'FILL', symbol: 'SOXL', side: 'sell', qty: '.5', price: '100' },
      { id: 'c', activity_type: 'DIV', symbol: 'SOXL', net_amount: '.1' },
      { id: 'd', activity_type: 'DIV', symbol: 'NVDA', net_amount: '25' },
      { id: 'e', activity_type: 'FEE', description: 'TAF', net_amount: '-.02' },
    ], positions: [{ symbol: 'SOXL', qty: '.5', cost_basis: '45', market_value: '50' }, { symbol: 'NVDA', qty: '1', cost_basis: '100', market_value: '200' }] });
  expect(result.grossRealized).toBe(5);
  expect(result.netPnl).toBeCloseTo(10.08);
  expect(result.ledger.map((e) => e.id)).not.toContain('d');
});
it('rejects unexplained quantity changes instead of attributing manual holdings', () => {
  expect(() => reconcileActivities({ universe: ['SOXL'], activities: [], positions: [{ symbol: 'SOXL', qty: 1 }] })).toThrow('Activity/position mismatch');
});
it('does not assign account fees when unrelated trades share the period', () => {
  const r = reconcileActivities({ universe: ['SOXL'], includeAccountFees: true, positions: [], activities: [
    { id: 'personal', activity_type: 'FILL', symbol: 'NVDA' }, { id: 'fee', activity_type: 'FEE', net_amount: '-1' },
  ] });
  expect(r.tradingFees).toBe(0);
  expect(r.unallocated).toEqual(['fee']);
});
it('does not accept an incomplete or repeating activity pagination', async () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({ id: String(id) }));
  const keys = { apiUrl: 'test', client: { get: jest.fn(async () => ({ data: rows })) } };
  await expect(collectActivities(keys, '2026-02-01')).rejects.toThrow('pagination did not advance');
});
