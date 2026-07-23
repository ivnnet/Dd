const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Member Joined')
      .setDescription(`${member.user.tag} (${member.id})`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields({ name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` })
      .setTimestamp();
    await sendLog(member.guild, client, embed);
  },
};
