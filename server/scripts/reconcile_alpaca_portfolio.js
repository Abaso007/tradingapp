// Broker GETs only. Defaults to dry run; --apply requires the inspected plan's
// hash. Never starts the server, scheduler or sends/cancels orders.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../config/.env') });
const mongoose = require('mongoose');
const Portfolio = require('../models/portfolioModel');
const { getAlpacaConfig } = require('../config/alpacaConfig');
const { syncLedger } = require('../services/alpacaLedger');
const { withBrokerAccountLock } = require('../services/brokerAccountLock');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const id = option('--strategy');
const universe = (option('--universe') || '').split(',').filter(Boolean);
const after = option('--after');
const output = option('--out');
const apply = args.includes('--apply');
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pick = (p) => ({ stocks: p.stocks, retainedCash: p.retainedCash, cashBuffer: p.cashBuffer, initialInvestment: p.initialInvestment, realizedPnlValue: p.realizedPnlValue, lastRebalancedAt: p.lastRebalancedAt, executionJournal: p.executionJournal, accounting: p.accounting });
(async () => {
  if (!id || !universe.length || !after || !output) throw new Error('Required: --strategy ID --universe SOXL,... --after ISO_DATE --out private-plan.json [--apply --plan-hash SHA256]');
  const rawUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE;
  const uri = rawUri?.replace(/<password>/ig, encodeURIComponent(process.env.MONGO_PASSWORD || process.env.MONGODB_PASSWORD || process.env.DATABASE_PASSWORD || ''));
  if (!uri) throw new Error('Mongo URI unavailable');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const p = await Portfolio.findOne({ strategy_id: id, provider: { $ne: 'polymarket' } });
  if (!p || !p.userId) throw new Error('Portfolio not found');
  const config = await getAlpacaConfig(p.userId, p.alpaca?.executionMode);
  const perform = async (assertOwned = async () => {}) => {
    if (apply) {
      const fresh = await Portfolio.findById(p._id);
      if (hash(pick(fresh)) !== hash(pick(p))) throw new Error('Portfolio changed while acquiring lock; retry dry run');
    }
    if (p.executionJournal && !p.executionJournal.committed) throw new Error('Pending execution journal must be recovered first');
    const before = JSON.parse(JSON.stringify(pick(p)));
    const currentHash = hash(before);
    if (apply) {
      const inspected = JSON.parse(fs.readFileSync(output, 'utf8'));
      if (option('--plan-hash') !== hash(inspected) || inspected.beforeHash !== currentHash) throw new Error('Plan/state changed: perform a new dry run');
      const scope = inspected.after?.accounting;
      if (inspected.strategyId !== id || scope?.activityStart !== after || JSON.stringify(scope?.universe) !== JSON.stringify(universe) || scope?.includeAccountFees !== args.includes('--include-account-fees')) {
        throw new Error('Reconciliation scope differs from the inspected plan');
      }
    }
    p.accounting = { ...(p.accounting || {}), activityStart: after, universe, includeAccountFees: args.includes('--include-account-fees'), capitalVerified: false,
      legacyInitialInvestment: p.accounting?.legacyInitialInvestment ?? p.initialInvestment };
    const result = await syncLedger(p, config.getTradingKeys(), { persistEntries: apply });
    const plan = { strategyId: id, mode: p.alpaca?.executionMode, beforeHash: currentHash, before, after: JSON.parse(JSON.stringify(pick(p))),
      netPnl: result.netPnl, grossRealized: result.grossRealized, activities: result.ledger.length, unallocated: result.unallocated };
    if (apply) {
      await assertOwned();
      const update = { stocks: p.stocks, retainedCash: p.retainedCash, cashBuffer: p.cashBuffer, realizedPnlValue: p.realizedPnlValue,
        pnlValue: p.pnlValue, pnlPercent: p.pnlPercent, currentValue: p.currentValue, accounting: p.accounting, lastPerformanceComputedAt: new Date() };
      const saved = await Portfolio.updateOne({ _id: p._id, __v: p.__v, lastRebalancedAt: p.lastRebalancedAt }, { $set: update, $inc: { __v: 1 } });
      if (saved.matchedCount !== 1) throw new Error('Concurrent portfolio update; reconciliation not applied');
      fs.writeFileSync(`${output}.applied.json`, JSON.stringify(plan, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ applied: true, strategyId: id, netPnl: result.netPnl }));
    } else {
      fs.writeFileSync(output, JSON.stringify(plan, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ dryRun: true, planHash: hash(plan), strategyId: id, grossRealized: result.grossRealized, netPnl: result.netPnl, cashBefore: before.retainedCash, cashAfter: p.retainedCash, entries: result.ledger.length }));
    }
  };
  if (apply) await withBrokerAccountLock(config.getTradingKeys(), perform); else await perform();
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
