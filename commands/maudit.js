const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('maudit')
    .setDescription('View audit log history for a user')
    .addUserOption(option => option.setName('target').setDescription('The member to look up').setRequired(true))
    .addStringOption(option => option.setName('action').setDescription('Filter by action type').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const actionFilter = interaction.options.getString('action');

    await interaction.deferReply({ ephemeral: true });

    try {
      const logs = await interaction.client.auditLog.getAuditLogsByUser(interaction.guild.id, target.id);
      let filtered = logs;
      if (actionFilter) {
        filtered = logs.filter(l => l.action.toLowerCase().includes(actionFilter.toLowerCase()));
      }

      if (filtered.length === 0) {
        return interaction.editReply({ content: `No audit log entries found for ${target.tag}.`, ephemeral: true });
      }

      const grouped = {};
      for (const log of filtered.slice(0, 50)) {
        const date = new Date(log.timestamp).toLocaleDateString();
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(log);
      }

      const embeds = [];
      let description = '';
      let count = 0;

      for (const [date, entries] of Object.entries(grouped)) {
        if (count >= 25) break;
        description += `**${date}**\n`;
        for (const entry of entries) {
          if (count >= 25) break;
          const time = new Date(entry.timestamp).toLocaleTimeString();
          const modTag = entry.moderatorTag ? ` by ${entry.moderatorTag}` : '';
          description += `\`${time}\` **${entry.action}**${modTag} — ${entry.reason || entry.details?.reason || 'No reason'}\n`;
          count++;
        }
        description += '\n';
      }

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle(`Audit Log — ${target.tag}`)
        .setDescription(description || 'No entries found.')
        .setFooter({ text: `Showing ${count} of ${filtered.length} entries` })
        .setTimestamp();

      embeds.push(embed);

      if (filtered.length > 50) {
        embeds.push(new EmbedBuilder()
          .setColor(0xf39c12)
          .setDescription(`*${filtered.length - 50} more entries not shown. Use the web dashboard for the full view.*`));
      }

      await interaction.editReply({ embeds, ephemeral: true });
    } catch (err) {
      console.error('maudit error:', err);
      await interaction.editReply({ content: 'Error fetching audit logs. Make sure MongoDB is configured.', ephemeral: true });
    }
  },
};
