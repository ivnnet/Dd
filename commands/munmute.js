const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('munmute')
    .setDescription('Remove a timeout from a member'),
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    if (!target) {
      return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    }

    if (!target.moderatable) {
      return interaction.reply({ content: 'I cannot modify this user.', ephemeral: true });
    }

    if (!target.communicationDisabledUntil) {
      return interaction.reply({ content: 'This user is not timed out.', ephemeral: true });
    }

    await target.timeout(null, reason);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`Timeout Removed in ${interaction.guild.name}`)
      .setDescription(`**Reason:** ${reason}`)
      .setTimestamp();
    try {
      await target.send({ embeds: [embed] });
    } catch {
      // DMs closed
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Timeout Removed')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);
    interaction.client.auditLog.logAction('unmute', {
      userId: target.id, userTag: target.user.tag,
      guildId: interaction.guild.id,
      moderatorId: interaction.user.id, moderatorTag: interaction.user.tag,
      reason, details: { source: 'command' },
    });

    return interaction.reply({ content: `Removed timeout from ${target.user.tag}.`, ephemeral: true });
  },
};
