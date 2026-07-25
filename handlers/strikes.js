const Strike = require('../models/Strike');
const db = require('./database');

async function addStrike(userId, guildId, moderatorId, publicReason, privateReason) {
  if (!db.isReady()) return null;
  try {
    const userStrikes = await Strike.find({ userId, guildId }).sort({ strikeId: 1 });
    const strikeId = userStrikes.length > 0 ? userStrikes[userStrikes.length - 1].strikeId + 1 : 1;
    const strike = new Strike({ strikeId, userId, guildId, moderatorId, publicReason, privateReason });
    await strike.save();
    return strikeId;
  } catch (err) {
    console.error('addStrike error:', err);
    return null;
  }
}

async function removeStrike(userId, guildId, strikeId) {
  if (!db.isReady()) return false;
  try {
    const result = await Strike.deleteOne({ userId, guildId, strikeId });
    if (result.deletedCount === 0) return false;
    const remaining = await Strike.find({ userId, guildId }).sort({ strikeId: 1 });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].strikeId !== i + 1) {
        await Strike.updateOne({ _id: remaining[i]._id }, { strikeId: i + 1 });
      }
    }
    return true;
  } catch (err) {
    console.error('removeStrike error:', err);
    return false;
  }
}

async function getStrikes(userId, guildId) {
  if (!db.isReady()) return [];
  try {
    return await Strike.find({ userId, guildId }).sort({ strikeId: 1 }).lean();
  } catch {
    return [];
  }
}

async function getAllStrikes(guildId) {
  if (!db.isReady()) return [];
  try {
    const filter = guildId ? { guildId } : {};
    return await Strike.find(filter).sort({ timestamp: -1 }).lean();
  } catch {
    return [];
  }
}

module.exports = { addStrike, removeStrike, getStrikes, getAllStrikes };
