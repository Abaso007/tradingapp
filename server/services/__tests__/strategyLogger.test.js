describe('strategyLogger', () => {
  const create = jest.fn();
  const deleteMany = jest.fn();
  const lean = jest.fn();
  const select = jest.fn(() => ({ lean }));
  const limit = jest.fn(() => ({ select }));
  const skip = jest.fn(() => ({ limit }));
  const sort = jest.fn(() => ({ skip }));
  const find = jest.fn(() => ({ sort }));

  const loadModule = () => {
    jest.resetModules();
    jest.doMock('../../models/strategyLogModel', () => ({
      create,
      find,
      deleteMany,
    }));
    return require('../strategyLogger');
  };

  beforeEach(() => {
    create.mockReset();
    deleteMany.mockReset();
    find.mockReset();
    sort.mockReset();
    skip.mockReset();
    limit.mockReset();
    select.mockReset();
    lean.mockReset();
    select.mockImplementation(() => ({ lean }));
    limit.mockImplementation(() => ({ select }));
    skip.mockImplementation(() => ({ limit }));
    sort.mockImplementation(() => ({ skip }));
    find.mockImplementation(() => ({ sort }));
    process.env.STRATEGY_LOG_MAX_PER_STRATEGY = '3';
  });

  afterEach(() => {
    delete process.env.STRATEGY_LOG_MAX_PER_STRATEGY;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('prunes older logs after inserting when the per-strategy cap is exceeded', async () => {
    create.mockResolvedValue({ _id: 'new-log' });
    lean.mockResolvedValue([{ _id: 'cutoff-id', createdAt: new Date('2026-03-11T10:00:00.000Z') }]);
    deleteMany.mockResolvedValue({ deletedCount: 4 });

    const { recordStrategyLog } = loadModule();
    await recordStrategyLog({
      strategyId: 'strategy-1',
      userId: 'user-1',
      message: 'hello',
    });

    expect(create).toHaveBeenCalledWith({
      strategy_id: 'strategy-1',
      userId: 'user-1',
      strategyName: undefined,
      level: 'info',
      message: 'hello',
      details: null,
    });
    expect(find).toHaveBeenCalledWith({
      strategy_id: 'strategy-1',
      userId: 'user-1',
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(skip).toHaveBeenCalledWith(2);
    expect(deleteMany).toHaveBeenCalledWith({
      strategy_id: 'strategy-1',
      userId: 'user-1',
      $or: [
        { createdAt: { $lt: new Date('2026-03-11T10:00:00.000Z') } },
        {
          createdAt: new Date('2026-03-11T10:00:00.000Z'),
          _id: { $lt: 'cutoff-id' },
        },
      ],
    });
  });

  it('skips pruning when the cap is disabled', async () => {
    process.env.STRATEGY_LOG_MAX_PER_STRATEGY = '0';
    create.mockResolvedValue({ _id: 'new-log' });

    const { recordStrategyLog } = loadModule();
    await recordStrategyLog({
      strategyId: 'strategy-1',
      userId: 'user-1',
      message: 'hello',
    });

    expect(create).toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
