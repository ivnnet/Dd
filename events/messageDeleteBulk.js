const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'messageDeleteBulk',
  async execute(messages, client) {
    const first = messages.first();
    if (!first?.guild) return;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Bulk Message Deletion')
      .addFields(
        { name: 'Channel', value: `${first.channel}` },
        { name: 'Messages Deleted', value: `${messages.size}` },
      )
      .setTimestamp();
    await sendLog(first.guild, client, embed);
  },
};
