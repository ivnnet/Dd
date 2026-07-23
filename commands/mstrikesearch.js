const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mstrikesearch')
    .setDescription('View strike history for a member'),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const strikes = interaction.client.strikes.getStrikes(target.id, interaction.guild.id);

    if (strikes.length === 0) {
      return interaction.reply({ content: `${target.tag} has no strikes.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle(`Strike History for ${target.tag}`)
      .setTimestamp();

    strikes.forEach(s => {
      embed.addFields({
        name: `Strike #${s.id} — ${new Date(s.timestamp).toLocaleDateString()}`,
        value: `**Public:** ${s.publicReason}\n**Private:** ${s.privateReason || 'None'}\n**Moderator:** <@${s.moderatorId}>`,
      });
    });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
