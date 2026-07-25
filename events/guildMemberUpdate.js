const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    if (!newMember.guild) return;

    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 5,
      });
      const entry = auditLogs.entries.find(e => e.target && e.target.id === newMember.id);
      const executor = entry?.executor || null;

      if (addedRoles.size > 0) {
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('Role(s) Added')
          .setDescription(`<@${newMember.id}> — ${newMember.user.tag}`)
          .addFields(
            { name: 'Roles', value: addedRoles.map(r => r.name).join(', ') },
            { name: 'By', value: executor ? `<@${executor.id}>` : 'Unknown' },
          )
          .setTimestamp();
        await sendLog(newMember.guild, client, embed);
        client.auditLog.logAction('role_add', {
          userId: newMember.id, userTag: newMember.user.tag,
          guildId: newMember.guild.id,
          moderatorId: executor?.id || '',
          details: { roles: addedRoles.map(r => r.name), roleIds: addedRoles.map(r => r.id) },
        });
      }

      if (removedRoles.size > 0) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('Role(s) Removed')
          .setDescription(`<@${newMember.id}> — ${newMember.user.tag}`)
          .addFields(
            { name: 'Roles', value: removedRoles.map(r => r.name).join(', ') },
            { name: 'By', value: executor ? `<@${executor.id}>` : 'Unknown' },
          )
          .setTimestamp();
        await sendLog(newMember.guild, client, embed);
        client.auditLog.logAction('role_remove', {
          userId: newMember.id, userTag: newMember.user.tag,
          guildId: newMember.guild.id,
          moderatorId: executor?.id || '',
          details: { roles: removedRoles.map(r => r.name), roleIds: removedRoles.map(r => r.id) },
        });
      }
    } catch {}
  },
};
