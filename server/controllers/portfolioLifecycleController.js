const Portfolio = require('../models/portfolioModel');
const { getAlpacaConfig } = require('../config/alpacaConfig');
const { withBrokerAccountLock } = require('../services/brokerAccountLock');

exports.updateLifecycle = async (req, res) => {
  if (String(req.user) !== String(req.params.userId)) return res.status(403).json({ message: 'Unauthorized' });
  const state = req.body.lifecycle;
  if (!['active', 'paused'].includes(state)) return res.status(400).json({ message: 'Expected active or paused' });
  try {
    const filter = { userId: String(req.user), strategy_id: req.params.strategyId };
    const input = await Portfolio.findOne(filter);
    if (!input) return res.status(404).json({ message: 'Portfolio not found' });
    const change = async () => {
      const p = await Portfolio.findOne(filter);
      if (p.lifecycle === 'closed') throw new Error('Closed strategies cannot be restarted');
      if (state === 'active' && p.executionJournal?.committed === false) throw new Error('Pending orders must be reconciled before resuming');
      p.lifecycle = state === 'active' && p.closureRequestedAt ? 'closing' : state;
      p.executionAttempts = 0;
      if (state === 'active') p.nextRebalanceAt = new Date();
      await p.save();
      return p;
    };
    let p;
    if (input.provider === 'polymarket') p = await change();
    else {
      const config = await getAlpacaConfig(input.userId, input.alpaca?.executionMode);
      p = await withBrokerAccountLock(config.getTradingKeys(), change);
    }
    return res.json({ status: 'success', lifecycle: p.lifecycle });
  } catch (error) { return res.status(409).json({ status: 'fail', message: error.message }); }
};
