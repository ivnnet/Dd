const { EmbedBuilder, AuditLogEvent } = require('discord.js');

const inviteCache = new Map();

async function sendLog(guild, client, embed) {
  const logChannelId = client.config.logChannelId;
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch {}
}

function createLogEmbed(title, description, color = 0x2b2d31) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

async function getExecutor(guild, actionType, targetId) {
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
    const entry = auditLogs.entries.find(e => e.target && e.target.id === targetId);
    return entry?.executor || null;
  } catch {}
  return null;
}

function formatExecutor(executor) {
  if (!executor) return 'Unknown';
  return `<@${executor.id}>`;
}

async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, invites);
  } catch {}
}

async function findUsedInvite(guild) {
  try {
    const oldInvites = inviteCache.get(guild.id);
    if (!oldInvites) return null;
    const newInvites = await guild.invites.fetch();
    inviteCache.set(guild.id, newInvites);
    for (const [code, newInv] of newInvites) {
      const oldInv = oldInvites.get(code);
      if (!oldInv) {
        return { code: newInv.code, inviter: newInv.inviter, url: `https://discord.gg/${newInv.code}` };
      }
      if (newInv.uses > oldInv.uses) {
        return { code: newInv.code, inviter: newInv.inviter, url: `https://discord.gg/${newInv.code}` };
      }
    }
  } catch {}
  return null;
}

module.exports = { sendLog, createLogEmbed, getExecutor, formatExecutor, cacheInvites, findUsedInvite };
