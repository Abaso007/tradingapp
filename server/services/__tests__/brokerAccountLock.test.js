jest.mock('../../models/brokerAccountLockModel', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn(), deleteOne: jest.fn() }));
const Lock = require('../../models/brokerAccountLockModel');
const { withBrokerAccountLock } = require('../brokerAccountLock');
const keys = { apiUrl: 'https://broker.test', keyId: 'key' };
beforeEach(() => { jest.clearAllMocks(); Lock.updateOne.mockResolvedValue({ matchedCount: 1 }); Lock.deleteOne.mockResolvedValue({}); });
it('refuses a concurrent operation on a claimed broker account', async () => {
  Lock.findOneAndUpdate.mockRejectedValue({ code: 11000 });
  const handler = jest.fn();
  await expect(withBrokerAccountLock(keys, handler)).rejects.toThrow('busy');
  expect(handler).not.toHaveBeenCalled();
  expect(Lock.deleteOne).not.toHaveBeenCalled();
});
it('stops execution when ownership is lost and releases only its own token', async () => {
  Lock.findOneAndUpdate.mockResolvedValue({});
  Lock.updateOne.mockResolvedValue({ matchedCount: 0 });
  await expect(withBrokerAccountLock(keys, async (owned) => owned())).rejects.toThrow('lease lost');
  expect(Lock.deleteOne.mock.calls[0][0].owner).toBe(Lock.findOneAndUpdate.mock.calls[0][1].$set.owner);
});
