const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['viewer', 'editor'], required: true },
  tokenHash: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
});

module.exports = { Invitation: mongoose.model('Invitation', schema) };
