const StrategyLog = require('../models/strategyLogModel');

const parsePositiveInteger = (value, defaultValue) => {
  if (value == null || value === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  if (parsed <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(parsed));
};

const STRATEGY_LOG_MAX_PER_STRATEGY = parsePositiveInteger(
  process.env.STRATEGY_LOG_MAX_PER_STRATEGY,
  200
);

const pruneStrategyLogsForStrategy = async ({ strategyId, userId, maxLogs = STRATEGY_LOG_MAX_PER_STRATEGY }) => {
  if (!strategyId || !userId || !maxLogs) {
    return 0;
  }

  const threshold = await StrategyLog.find({
    strategy_id: String(strategyId),
    userId: String(userId),
  })
    .sort({ createdAt: -1, _id: -1 })
    .skip(Math.max(0, maxLogs - 1))
    .limit(1)
    .select({ _id: 1, createdAt: 1 })
    .lean();

  const cutoff = Array.isArray(threshold) ? threshold[0] : null;
  if (!cutoff?._id || !cutoff?.createdAt) {
    return 0;
  }

  const result = await StrategyLog.deleteMany({
    strategy_id: String(strategyId),
    userId: String(userId),
    $or: [
      { createdAt: { $lt: cutoff.createdAt } },
      {
        createdAt: cutoff.createdAt,
        _id: { $lt: cutoff._id },
      },
    ],
  });

  return Number(result?.deletedCount || 0);
};

const recordStrategyLog = async ({
  strategyId,
  userId,
  strategyName,
  level = 'info',
  message,
  details = null,
}) => {
  if (!strategyId || !userId || !message) {
    return;
  }

  try {
    await StrategyLog.create({
      strategy_id: strategyId,
      userId: String(userId),
      strategyName,
      level,
      message,
      details,
    });

    if (STRATEGY_LOG_MAX_PER_STRATEGY) {
      try {
        await pruneStrategyLogsForStrategy({
          strategyId,
          userId,
        });
      } catch (error) {
        console.error('[StrategyLog] Failed to prune logs:', error.message);
      }
    }
  } catch (error) {
    console.error('[StrategyLog] Failed to record log:', error.message);
  }
};

module.exports = {
  recordStrategyLog,
  __testOnly: {
    parsePositiveInteger,
    pruneStrategyLogsForStrategy,
  },
};
