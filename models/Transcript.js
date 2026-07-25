const mongoose = require('mongoose');

const transcriptSchema = new mongoose.Schema({
  ticketId: { type: String, required: true },
  userId: { type: String, required: true },
  userTag: { type: String, default: '' },
  channelId: { type: String, default: '' },
  channelName: { type: String, default: '' },
  url: { type: String, default: '' },
  closedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Transcript', transcriptSchema);
