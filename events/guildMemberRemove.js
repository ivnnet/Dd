const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Member Left')
      .setDescription(`${member.user.tag} (${member.id})`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields({ name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` })
      .setTimestamp();
    await sendLog(member.guild, client, embed);
  },
};
