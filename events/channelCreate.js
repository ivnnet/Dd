const { EmbedBuilder, ChannelType, AuditLogEvent } = require('discord.js');
const { sendLog, getExecutor, formatExecutor } = require('../handlers/logger');

module.exports = {
  name: 'channelCreate',
  async execute(channel, client) {
    if (!channel.guild) return;
    const executor = await getExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const typeNames = { [ChannelType.GuildText]: 'Text', [ChannelType.GuildVoice]: 'Voice', [ChannelType.GuildCategory]: 'Category', [ChannelType.GuildForum]: 'Forum', [ChannelType.GuildAnnouncement]: 'Announcement' };
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Channel Created')
      .addFields(
        { name: 'Name', value: channel.name },
        { name: 'Type', value: typeNames[channel.type] || 'Other' },
        { name: 'Category', value: channel.parent ? channel.parent.name : 'None' },
        { name: 'Created By', value: formatExecutor(executor) },
      )
      .setTimestamp();
    await sendLog(channel.guild, client, embed);
    client.auditLog.logAction('channel_create', {
      guildId: channel.guild.id,
      details: { channelName: channel.name, channelId: channel.id, channelType: channel.type, parentName: channel.parent?.name || 'None' },
    });
  },
};
