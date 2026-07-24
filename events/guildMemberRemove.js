const { EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name);
    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Member Left')
      .setDescription(`<@${member.user.id}> — ${member.user.tag}`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
        { name: 'Roles', value: roles.length ? roles.join(', ') : 'None' },
      )
      .setTimestamp();
    await sendLog(member.guild, client, embed);
  },
};
