const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog, getExecutor, formatExecutor } = require('../handlers/logger');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Channel Deleted')
      .addFields(
        { name: 'Name', value: channel.name },
        { name: 'Type', value: channel.type === 4 ? 'Category' : 'Channel' },
        { name: 'Deleted By', value: formatExecutor(executor) },
      )
      .setTimestamp();
    await sendLog(channel.guild, client, embed);
    client.auditLog.logAction('channel_delete', {
      guildId: channel.guild.id,
      details: { channelName: channel.name, channelId: channel.id, deletedBy: executor ? executor.tag : 'Unknown' },
    });
  },
};
