const AuditLog = require('../models/AuditLog');
const db = require('./database');

async function logAction(action, data) {
  if (!db.isReady()) return;
  try {
    const entry = new AuditLog({
      action,
      userId: data.userId || '',
      userTag: data.userTag || '',
      moderatorId: data.moderatorId || '',
      moderatorTag: data.moderatorTag || '',
      guildId: data.guildId || '',
      reason: data.reason || '',
      details: data.details || {},
    });
    await entry.save();
  } catch (err) {
    console.error('auditLog error:', err);
  }
}

async function getAuditLogs(guildId, filter = {}) {
  if (!db.isReady()) return [];
  try {
    const query = { guildId, ...filter };
    return await AuditLog.find(query).sort({ timestamp: -1 }).limit(200).lean();
  } catch {
    return [];
  }
}

async function getAuditLogsByUser(guildId, userId) {
  return getAuditLogs(guildId, {
    $or: [{ userId }, { moderatorId: userId }],
  });
}

module.exports = { logAction, getAuditLogs, getAuditLogsByUser };
