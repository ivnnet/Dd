const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'roleDelete',
  async execute(role, client) {
    if (!role.guild) return;
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Role Deleted')
      .addFields(
        { name: 'Name', value: role.name },
        { name: 'ID', value: role.id },
      )
      .setTimestamp();
    await sendLog(role.guild, client, embed);
  },
};
