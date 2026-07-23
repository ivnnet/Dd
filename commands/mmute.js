const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog } = require('../handlers/logger');

function parseDuration(str) {
  const match = str.match(/^(\d+)([mhd])$/);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2];
  const ms = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return val * ms;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mmute')
    .setDescription('Timeout a member'),
  async execute(interaction) {
    const target = interaction.options.getMember('target');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    const notify = interaction.options.getBoolean('notify') ?? true;

    if (!target) {
      return interaction.reply({ content: 'That user is not in this server.', ephemeral: true });
    }

    if (!target.moderatable) {
      return interaction.reply({ content: 'I cannot timeout this user.', ephemeral: true });
    }

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({ content: 'Invalid duration. Use format like `10m`, `1h`, `7d`.', ephemeral: true });
    }

    const until = new Date(Date.now() + ms);
    await target.timeout(ms, reason);

    if (notify) {
      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle(`Timed Out in ${interaction.guild.name}`)
        .setDescription(`**Duration:** ${durationStr}\n**Reason:** ${reason}`)
        .setTimestamp();
      try {
        await target.send({ embeds: [embed] });
      } catch {
        // DMs closed
      }
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle('Member Timed Out')
      .addFields(
        { name: 'User', value: `${target.user.tag} (${target.id})` },
        { name: 'Moderator', value: `${interaction.user.tag}` },
        { name: 'Duration', value: durationStr },
        { name: 'Reason', value: reason },
      )
      .setTimestamp();

    await sendLog(interaction.guild, interaction.client, logEmbed);

    return interaction.reply({ content: `Timed out ${target.user.tag} for ${durationStr}.`, ephemeral: true });
  },
};
