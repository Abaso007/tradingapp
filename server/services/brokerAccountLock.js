const { createHash, randomUUID } = require('crypto');
const Lock = require('../models/brokerAccountLockModel');
const LEASE_MS = 5 * 60 * 1000;

const withBrokerAccountLock = async (keys, handler) => {
  const id = createHash('sha256').update(`${keys.apiUrl}:${keys.keyId}`).digest('hex');
  const owner = randomUUID();
  let lost = false;
  try {
    await Lock.findOneAndUpdate(
      { _id: id, expiresAt: { $lte: new Date() } },
      { $set: { owner, expiresAt: new Date(Date.now() + LEASE_MS) } },
      { upsert: true, new: true }
    );
  } catch (error) {
    if (error.code === 11000) throw new Error('Broker account is busy; retry after its current operation');
    throw error;
  }
  const assertOwned = async () => {
    if (lost) throw new Error('Broker account lease lost; execution stopped');
    const result = await Lock.updateOne(
      { _id: id, owner, expiresAt: { $gt: new Date() } },
      { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } }
    );
    if (result.matchedCount !== 1) {
      lost = true;
      throw new Error('Broker account lease lost; execution stopped');
    }
  };
  const timer = setInterval(() => { void assertOwned().catch(() => { lost = true; }); }, 20000);
  timer.unref?.();
  try { return await handler(assertOwned); }
  finally {
    clearInterval(timer);
    await Lock.deleteOne({ _id: id, owner });
  }
};
module.exports = { withBrokerAccountLock };
