const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole, client) {
    if (!newRole.guild) return;
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`Name: \`${oldRole.name}\` → \`${newRole.name}\``);
    if (oldRole.hexColor !== newRole.hexColor) changes.push(`Color: \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
    if (oldRole.hoist !== newRole.hoist) changes.push(`Hoisted: \`${oldRole.hoist}\` → \`${newRole.hoist}\``);
    if (oldRole.mentionable !== newRole.mentionable) changes.push(`Mentionable: \`${oldRole.mentionable}\` → \`${newRole.mentionable}\``);
    if (changes.length === 0) return;
    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('Role Updated')
      .addFields(
        { name: 'Role', value: newRole.name },
        { name: 'Changes', value: changes.join('\n') },
      )
      .setTimestamp();
    await sendLog(newRole.guild, client, embed);
    client.auditLog.logAction('role_update', {
      guildId: newRole.guild.id,
      details: { roleName: newRole.name, roleId: newRole.id, changes },
    });
  },
};
