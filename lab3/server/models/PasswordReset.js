const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  PasswordReset: mongoose.model('PasswordReset', passwordResetSchema),
};
