const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (message.author?.bot) return;
    if (!message.guild) return;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Message Deleted')
      .addFields(
        { name: 'Channel', value: `${message.channel}` },
        { name: 'Author', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown' },
        { name: 'Content', value: message.content ? message.content.slice(0, 1024) : '(no content / embed only)' },
      )
      .setTimestamp();
    await sendLog(message.guild, client, embed);
  },
};
