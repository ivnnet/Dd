const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mstrikeremove')
    .setDescription('Remove a specific strike from a member'),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const strikeId = interaction.options.getInteger('strike_id');

    const removed = interaction.client.strikes.removeStrike(target.id, interaction.guild.id, strikeId);

    if (!removed) {
      return interaction.reply({ content: `No strike #${strikeId} found for ${target.tag}.`, ephemeral: true });
    }

    const dmEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`Strike #${strikeId} Removed`)
      .setDescription(`A strike has been removed in **${interaction.guild.name}**`)
      .addFields(
        { name: 'Strike ID', value: `#${strikeId}` },
      )
      .setTimestamp();

    try {
      await target.send({ embeds: [dmEmbed] });
    } catch {}

    const logEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('Strike Removed')
      .addFields(
        { name: 'User', value: `${target.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Removed Strike ID', value: `#${strikeId}` },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);

    return interaction.reply({ content: `Removed Strike #${strikeId} from ${target.tag}.`, ephemeral: true });
  },
};
