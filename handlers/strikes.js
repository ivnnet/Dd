const fs = require('fs');
const path = require('path');
const strikesPath = path.join(__dirname, '..', 'data', 'strikes.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(strikesPath, 'utf8'));
  } catch {
    return [];
  }
}

function write(data) {
  fs.writeFileSync(strikesPath, JSON.stringify(data, null, 2));
}

function addStrike(userId, guildId, moderatorId, publicReason, privateReason) {
  const strikes = read();
  const userStrikes = strikes.filter(s => s.userId === userId && s.guildId === guildId);
  const strikeId = userStrikes.length + 1;
  strikes.push({
    id: strikeId,
    userId,
    guildId,
    moderatorId,
    publicReason,
    privateReason: privateReason || '',
    timestamp: new Date().toISOString(),
  });
  write(strikes);
  return strikeId;
}

function removeStrike(userId, guildId, strikeId) {
  const strikes = read();
  const idx = strikes.findIndex(s => s.userId === userId && s.guildId === guildId && s.id === strikeId);
  if (idx === -1) return false;
  strikes.splice(idx, 1);
  const userStrikes = strikes.filter(s => s.userId === userId && s.guildId === guildId);
  userStrikes.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  userStrikes.forEach((s, i) => s.id = i + 1);
  write(strikes);
  return true;
}

function getStrikes(userId, guildId) {
  return read().filter(s => s.userId === userId && s.guildId === guildId);
}

function getAllStrikes() {
  return read();
}

module.exports = { addStrike, removeStrike, getStrikes, getAllStrikes };
