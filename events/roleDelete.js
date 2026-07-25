const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog, getExecutor, formatExecutor } = require('../handlers/logger');



module.exports = {
  name: 'roleDelete',
  async execute(role, client) {
    if (!role.guild) return;
    const executor = await getExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Role Deleted')
      .addFields(
        { name: 'Name', value: role.name },
        { name: 'ID', value: role.id },
        { name: 'Deleted By', value: formatExecutor(executor) },
      )
      .setTimestamp();
    await sendLog(role.guild, client, embed);
    client.auditLog.logAction('role_delete', {
      guildId: role.guild.id,
      details: { roleName: role.name, roleId: role.id, deletedBy: executor ? executor.tag : 'Unknown' },
    });
  },
};
