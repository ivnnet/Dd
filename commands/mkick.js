const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mkick')
    .setDescription('Kick a member from the server'),
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const notify = interaction.options.getBoolean('notify') ?? true;

    if (!target) {
      return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    }

    if (!target.kickable) {
      return interaction.reply({ content: 'I cannot kick this user.', ephemeral: true });
    }

    if (notify) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`Kicked from ${interaction.guild.name}`)
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp();
      try {
        await target.send({ embeds: [embed] });
      } catch {
        // DMs closed
      }
    }

    await target.kick(reason);

    const logEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Member Kicked')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);

    return interaction.reply({ content: `Kicked ${target.user.tag}.`, ephemeral: true });
  },
};
