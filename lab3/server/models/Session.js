const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshHash: { type: String, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = {
  Session: mongoose.model('Session', sessionSchema),
};
