const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

function parseDuration(str) {
  const match = str.match(/^(\d+)([mhd])$/);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2];
  const ms = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return val * ms;
}

const activeGiveaways = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway'),
  async execute(interaction) {
    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winners = interaction.options.getInteger('winners') || 1;

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({ content: 'Invalid duration. Use format like `1h`, `24h`, `7d`.', ephemeral: true });
    }

    if (ms < 60000) {
      return interaction.reply({ content: 'Duration must be at least 1 minute.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🎉 Giveaway')
      .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Hosted by:** ${interaction.user}`)
      .setFooter({ text: `Ends — use ${durationStr} from now` })
      .setTimestamp(Date.now() + ms);

    await interaction.reply({ content: 'Giveaway started!', ephemeral: true });

    const msg = await interaction.channel.send({ embeds: [embed] });
    await msg.react('🎉');

    const giveawayId = `${interaction.guild.id}-${msg.id}`;
    activeGiveaways.set(giveawayId, { msg, prize, winners, endTime: Date.now() + ms });

    setTimeout(async () => {
      activeGiveaways.delete(giveawayId);
      const fetched = await msg.channel.messages.fetch(msg.id);
      const reaction = fetched.reactions.cache.get('🎉');
      if (!reaction) {
        return fetched.edit({ embeds: [EmbedBuilder.from(embed).setColor(0x95a5a6).setDescription('**Giveaway cancelled — no entries.**').setFooter(null)] });
      }

      const users = await reaction.users.fetch();
      const entries = users.filter(u => !u.bot).map(u => u);
      if (entries.length === 0) {
        return fetched.edit({ embeds: [EmbedBuilder.from(embed).setColor(0x95a5a6).setDescription('**Giveaway ended — no valid entries.**').setFooter(null)] });
      }

      const chosen = [];
      const pool = [...entries];
      for (let i = 0; i < Math.min(winners, pool.length); i++) {
        const idx = Math.floor(Math.random() * pool.length);
        chosen.push(pool.splice(idx, 1)[0]);
      }

      const resultEmbed = EmbedBuilder.from(embed)
        .setColor(0x2ecc71)
        .setDescription(`**Prize:** ${prize}\n**Winners:** ${chosen.map(u => u.toString()).join(', ')}\n**Hosted by:** ${interaction.user}`)
        .setFooter({ text: 'Giveaway ended' });

      await fetched.edit({ embeds: [resultEmbed] });
      await fetched.reply({ content: `Congratulations ${chosen.map(u => u.toString()).join(', ')}! You won **${prize}**!` });
    }, ms);
  },
};
