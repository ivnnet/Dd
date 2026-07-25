const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog, getExecutor, formatExecutor } = require('../handlers/logger');

module.exports = {
  name: 'roleCreate',
  async execute(role, client) {
    if (!role.guild) return;
    const executor = await getExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Role Created')
      .addFields(
        { name: 'Name', value: role.name },
        { name: 'Color', value: role.hexColor },
        { name: 'Created By', value: formatExecutor(executor) },
      )
      .setTimestamp();
    await sendLog(role.guild, client, embed);
    client.auditLog.logAction('role_create', {
      guildId: role.guild.id,
      details: { roleName: role.name, roleId: role.id, roleColor: role.hexColor, createdBy: executor ? executor.tag : 'Unknown' },
    });
  },
};
