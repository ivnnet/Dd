const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild, client) {
    const changes = [];
    if (oldGuild.name !== newGuild.name) changes.push(`Name: \`${oldGuild.name}\` → \`${newGuild.name}\``);
    if (oldGuild.icon !== newGuild.icon) changes.push(`Server icon changed`);
    if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.push('AFK channel changed');
    if (oldGuild.systemChannelId !== newGuild.systemChannelId) changes.push('System message channel changed');
    if (changes.length === 0) return;
    const embed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('Server Settings Updated')
      .setDescription(changes.join('\n'))
      .setTimestamp();
    await sendLog(newGuild, client, embed);
  },
};
