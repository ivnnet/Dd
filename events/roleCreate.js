const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'roleCreate',
  async execute(role, client) {
    if (!role.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Role Created')
      .addFields(
        { name: 'Name', value: role.name },
        { name: 'Color', value: role.hexColor },
        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No' },
      )
      .setTimestamp();
    await sendLog(role.guild, client, embed);
  },
};
