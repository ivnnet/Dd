const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mstrike')
    .setDescription('Issue a strike to a member'),
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const publicReason = interaction.options.getString('public_reason');
    const privateReason = interaction.options.getString('private_reason') || 'No private reason provided.';

    if (!target) {
      return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    }

    if (!target.moderatable) {
      return interaction.reply({ content: 'I cannot strike this user.', ephemeral: true });
    }

    const strikeId = interaction.client.strikes.addStrike(target.id, interaction.guild.id, interaction.user.id, publicReason, privateReason);

    const strikeEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`Strike #${strikeId} Issued`)
      .setDescription(`You have received a strike in **${interaction.guild.name}**`)
      .addFields(
        { name: 'Reason', value: publicReason },
        { name: 'Strike ID', value: `#${strikeId}` },
      )
      .setTimestamp();

    try {
      await target.send({ embeds: [strikeEmbed] });
    } catch {
      // DMs closed
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Strike Issued')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Public Reason', value: publicReason },
        { name: 'Private Reason', value: privateReason },
        { name: 'Strike ID', value: `#${strikeId}` },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);

    return interaction.reply({ content: `Struck ${target.user.tag} with Strike #${strikeId}.`, ephemeral: true });
  },
};
