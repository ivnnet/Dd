const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('munban')
    .setDescription('Unban a user from the server'),
  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    try {
      const banList = await interaction.guild.bans.fetch();
      const banned = banList.get(userId);
      if (!banned) {
        return interaction.reply({ content: 'That user is not banned.', ephemeral: true });
      }

      await interaction.guild.members.unban(userId, reason);

      const dmEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle(`Unbanned from ${interaction.guild.name}`)
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp();

      try {
        await banned.user.send({ embeds: [dmEmbed] });
      } catch {}

      const logEmbed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Member Unbanned')
        .addFields(
          { name: 'User', value: `${banned.user.tag} (${userId})` },
          { name: 'Moderator', value: `${interaction.user.tag}` },
          { name: 'Reason', value: reason },
        )
        .setTimestamp();

      await sendLog(interaction.guild, interaction.client, logEmbed);
      interaction.client.auditLog.logAction('unban', {
        userId, userTag: banned.user.tag,
        guildId: interaction.guild.id,
        moderatorId: interaction.user.id, moderatorTag: interaction.user.tag,
        reason, details: { source: 'command' },
      });

      return interaction.reply({ content: `Unbanned ${banned.user.tag}.`, ephemeral: true });
    } catch {
      return interaction.reply({ content: 'Failed to unban that user. Check the ID and try again.', ephemeral: true });
    }
  },
};
