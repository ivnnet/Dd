const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  userId: { type: String, default: '' },
  userTag: { type: String, default: '' },
  moderatorId: { type: String, default: '' },
  moderatorTag: { type: String, default: '' },
  guildId: { type: String, required: true },
  reason: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ userId: 1, guildId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
