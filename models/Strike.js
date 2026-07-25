const mongoose = require('mongoose');

const strikeSchema = new mongoose.Schema({
  strikeId: { type: Number, required: true },
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  moderatorId: { type: String, required: true },
  publicReason: { type: String, default: '' },
  privateReason: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
});

strikeSchema.index({ userId: 1, guildId: 1 });

module.exports = mongoose.model('Strike', strikeSchema);
