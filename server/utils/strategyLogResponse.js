const clampMaxItems = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const pickObjectFields = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const picked = {};
  keys.forEach((key) => {
    if (value[key] !== undefined && value[key] !== null) {
      picked[key] = value[key];
    }
  });
  return Object.keys(picked).length ? picked : null;
};

const compactThoughtProcess = (thoughtProcess, options = {}) => {
  if (!thoughtProcess || typeof thoughtProcess !== 'object' || Array.isArray(thoughtProcess)) {
    return null;
  }

  const maxReasoningItems = clampMaxItems(options.maxReasoningItems, 20);
  const maxAdjustmentItems = clampMaxItems(options.maxAdjustmentItems, 20);
  const maxComposerPositions = clampMaxItems(options.maxComposerPositions, 25);
  const compact = {};

  if (typeof thoughtProcess.summary === 'string' && thoughtProcess.summary.trim()) {
    compact.summary = thoughtProcess.summary.trim();
  }

  if (Array.isArray(thoughtProcess.reasoning) && thoughtProcess.reasoning.length) {
    compact.reasoning = thoughtProcess.reasoning.filter(Boolean).slice(0, maxReasoningItems);
  }

  if (Array.isArray(thoughtProcess.adjustments) && thoughtProcess.adjustments.length) {
    compact.adjustments = thoughtProcess.adjustments.slice(0, maxAdjustmentItems);
  }

  const cashSummary = pickObjectFields(thoughtProcess.cashSummary, [
    'cashBefore',
    'cashAfterSells',
    'cashAfterBuys',
    'cashBuffer',
    'buyBudget',
  ]);
  if (cashSummary) {
    compact.cashSummary = cashSummary;
  }

  if (Array.isArray(thoughtProcess.composerPositions) && thoughtProcess.composerPositions.length) {
    compact.composerPositions = thoughtProcess.composerPositions.slice(0, maxComposerPositions);
  }

  if (thoughtProcess.tooling && typeof thoughtProcess.tooling === 'object' && !Array.isArray(thoughtProcess.tooling)) {
    const tooling = {};
    if (thoughtProcess.tooling.localEvaluator && typeof thoughtProcess.tooling.localEvaluator === 'object') {
      tooling.localEvaluator = pickObjectFields(thoughtProcess.tooling.localEvaluator, [
        'used',
        'lookbackDays',
        'tickers',
        'blueprint',
      ]);
    }
    if (Object.keys(tooling).length) {
      compact.tooling = tooling;
    }
  }

  return Object.keys(compact).length ? compact : null;
};

const compactStrategyLogDetails = (details, options = {}) => {
  if (details === null || details === undefined) {
    return null;
  }
  if (typeof details !== 'object' || Array.isArray(details)) {
    return details;
  }

  const maxTradeItems = clampMaxItems(options.maxTradeItems, 100);
  const maxPositionItems = clampMaxItems(options.maxPositionItems, 40);
  const maxSkippedItems = clampMaxItems(options.maxSkippedItems, 25);

  const compact = {};
  [
    'provider',
    'humanSummary',
    'mode',
    'tradeSource',
    'tradesSourceSetting',
    'envExecutionMode',
    'portfolioExecutionMode',
    'executionMode',
    'executionEnabled',
    'executionDisabledReason',
    'executionAbort',
    'portfolioUpdated',
    'hasClobCredentials',
    'sizeToBudget',
    'sizeToBudgetBasis',
    'sizedToBudget',
    'seedFromPositions',
    'retryingStoredLiveRebalance',
    'holdingsSource',
    'pagesFetched',
    'processedTrades',
    'buyCount',
    'sellCount',
    'rebalanceCount',
    'skippedCount',
    'cash',
    'targetCash',
    'positionsCount',
    'targetPositionsCount',
    'positionsTrimmed',
    'targetPositionsTrimmed',
    'startingCash',
    'address',
    'authAddress',
    'error',
  ].forEach((key) => {
    if (details[key] !== undefined && details[key] !== null) {
      compact[key] = details[key];
    }
  });

  const thoughtProcess = compactThoughtProcess(details.thoughtProcess, options);
  if (thoughtProcess) {
    compact.thoughtProcess = thoughtProcess;
  }

  const sizing = pickObjectFields(details.sizing, [
    'sizeToBudgetBasis',
    'scaleBasis',
    'sizingBudget',
    'scale',
    'makerValue',
    'scaleBudget',
    'scaleMakerValue',
    'scaleSetAt',
    'lastUpdatedAt',
  ]);
  if (sizing) {
    compact.sizing = sizing;
  }

  const liveRebalanceConfig = pickObjectFields(details.liveRebalanceConfig, [
    'minNotional',
    'maxOrders',
    'preflightEnabled',
    'orderbookPreflightEnabled',
  ]);
  if (liveRebalanceConfig) {
    compact.liveRebalanceConfig = liveRebalanceConfig;
  }

  [
    'liveRebalancePlan',
    'liveRebalancePreflight',
    'pendingLiveRebalance',
    'autoRedeem',
    'timings',
    'clobAuthCooldown',
    'clobRateLimitCooldown',
  ].forEach((key) => {
    if (details[key] && typeof details[key] === 'object' && !Array.isArray(details[key])) {
      compact[key] = details[key];
    }
  });

  [
    ['buys', maxTradeItems],
    ['sells', maxTradeItems],
    ['rebalance', maxTradeItems],
    ['holds', maxTradeItems],
    ['positions', maxPositionItems],
    ['targetPositions', maxPositionItems],
    ['skipped', maxSkippedItems],
  ].forEach(([key, maxItems]) => {
    if (Array.isArray(details[key]) && details[key].length) {
      compact[key] = details[key].slice(0, maxItems);
    }
  });

  return Object.keys(compact).length ? compact : null;
};

module.exports = {
  compactStrategyLogDetails,
};
