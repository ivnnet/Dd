const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mban')
    .setDescription('Ban a member from the server'),
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;
    const notify = interaction.options.getBoolean('notify') ?? true;

    if (!target) {
      return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    }

    if (!target.bannable) {
      return interaction.reply({ content: 'I cannot ban this user.', ephemeral: true });
    }

    if (notify) {
      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle(`Banned from ${interaction.guild.name}`)
        .setDescription(`**Reason:** ${reason}`)
        .setTimestamp();
      try {
        await target.send({ embeds: [embed] });
      } catch {
        // DMs closed
      }
    }

    await target.ban({ reason, deleteMessageSeconds: deleteDays * 86400 });

    const logEmbed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Member Banned')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Reason', value: reason },
        { name: 'Messages Deleted', value: `${deleteDays} day(s)` },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);

    return interaction.reply({ content: `Banned ${target.user.tag}.`, ephemeral: true });
  },
};
