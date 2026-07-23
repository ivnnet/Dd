const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client) {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Channel Deleted')
      .addFields(
        { name: 'Name', value: channel.name },
        { name: 'Type', value: channel.type === 4 ? 'Category' : 'Channel' },
      )
      .setTimestamp();
    await sendLog(channel.guild, client, embed);
  },
};
