const { parseComposerScript } = require('../utils/composerDslParser');

const getRebalanceThreshold = (strategyText) => {
  if (!strategyText || !/\(defsymphony/i.test(strategyText)) return null;
  const ast = parseComposerScript(strategyText);
  const raw = ast?.[2]?.[':rebalance-threshold'];
  if (raw == null) return null;
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error('Invalid strategy rebalance threshold');
  }
  return threshold;
};

// Drift is measured in percentage points of strategy equity, including its
// assigned cash. Personal broker positions never enter this calculation.
const applyRebalanceCorridor = ({ adjustments, threshold, cash, budget, closing }) => {
  const invested = adjustments.reduce((sum, a) => sum + a.currentValue, 0);
  const equity = invested + Math.max(0, cash);
  const aboveCap = invested > budget + 0.01;
  const maxDeviation = equity > 0
    ? Math.max(0, ...adjustments.map(a => Math.abs(a.currentValue / equity - a.targetWeight)))
    : 1;
  const hold = !closing && threshold != null && !aboveCap && equity > 0 && maxDeviation <= threshold;
  if (hold) {
    for (const adjustment of adjustments) {
      adjustment.corridorTargetQty = adjustment.desiredQty;
      adjustment.desiredQty = adjustment.currentQty;
      adjustment.desiredValue = adjustment.currentValue;
    }
  }
  return { threshold, maxDeviation, hold, aboveCap,
    reason: closing ? 'closing' : aboveCap ? 'budget_cap' : threshold == null ? 'daily' : hold ? 'within_corridor' : 'threshold_exceeded' };
};

module.exports = { getRebalanceThreshold, applyRebalanceCorridor };
