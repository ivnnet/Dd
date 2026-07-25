const { EmbedBuilder } = require('discord.js');
const { sendLog, findUsedInvite } = require('../handlers/logger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const usedInvite = await findUsedInvite(member.guild);
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Member Joined')
      .setDescription(`<@${member.user.id}> — ${member.user.tag}`)
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true },
      );
    if (usedInvite) {
      if (usedInvite.inviter) {
        embed.addFields({ name: 'Invited By', value: `<@${usedInvite.inviter.id}>`, inline: true });
      }
      embed.addFields({ name: 'Invite Link', value: usedInvite.url, inline: true });
    }
    embed.setTimestamp();
    await sendLog(member.guild, client, embed);
    client.auditLog.logAction('member_join', {
      userId: member.user.id, userTag: member.user.tag,
      guildId: member.guild.id,
      details: { accountCreated: member.user.createdTimestamp, memberCount: member.guild.memberCount, invite: usedInvite?.url || null },
    });
  },
};
