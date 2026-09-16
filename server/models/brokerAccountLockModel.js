const mongoose = require('mongoose');

// No TTL index: an expired lease is claimed atomically, never blindly deleted.
module.exports = mongoose.model('BrokerAccountLock', new mongoose.Schema({
  _id: String,
  owner: String,
  expiresAt: Date,
}));
