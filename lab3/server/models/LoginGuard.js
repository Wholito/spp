const mongoose = require('mongoose');

const loginGuardSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fails: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  lockedUntil: { type: Date, default: null },
  expireAt: { type: Date, required: true },
});

loginGuardSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  LoginGuard: mongoose.model('LoginGuard', loginGuardSchema),
};
