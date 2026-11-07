const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  success: { type: Boolean, required: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});

module.exports = { LoginHistory: mongoose.model('LoginHistory', schema) };
