const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`Name: \`${oldChannel.name}\` → \`${newChannel.name}\``);
    if (oldChannel.topic !== newChannel.topic) changes.push(`Topic updated`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push(`Moved to category: ${newChannel.parent?.name || 'None'}`);
    if (changes.length === 0) return;
    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('Channel Updated')
      .addFields(
        { name: 'Channel', value: `${newChannel}` },
        { name: 'Changes', value: changes.join('\n') },
      )
      .setTimestamp();
    await sendLog(newChannel.guild, client, embed);
  },
};
