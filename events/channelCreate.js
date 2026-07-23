const { EmbedBuilder, ChannelType } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'channelCreate',
  async execute(channel, client) {
    if (!channel.guild) return;
    const typeNames = { [ChannelType.GuildText]: 'Text', [ChannelType.GuildVoice]: 'Voice', [ChannelType.GuildCategory]: 'Category', [ChannelType.GuildForum]: 'Forum', [ChannelType.GuildAnnouncement]: 'Announcement' };
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Channel Created')
      .addFields(
        { name: 'Name', value: channel.name },
        { name: 'Type', value: typeNames[channel.type] || 'Other' },
        { name: 'Category', value: channel.parent ? channel.parent.name : 'None' },
      )
      .setTimestamp();
    await sendLog(channel.guild, client, embed);
  },
};
