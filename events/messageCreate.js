const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createTicket, getActiveTicket, setActiveTicket, getTicketByChannel } = require('../handlers/modmail');
const groq = require('../handlers/groq');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    // Handle DM → modmail ticket
    if (message.channel.type === 1) {
      const guild = client.guilds.cache.get(client.config.guildId);
      if (!guild) return;

      let ticket = getActiveTicket(message.author.id);

      if (!ticket) {
        await createTicket(message.author, guild, client);
        ticket = getActiveTicket(message.author.id);
        if (!ticket) return;
      }

      const channel = guild.channels.cache.get(ticket.channelId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content)
        .setTimestamp();

      await channel.send({ embeds: [embed] });

      if (ticket.mode === 'ai' && groq.isReady()) {
        const aiReply = await groq.getAutoResponse(message.content, ticket.history);

        if (aiReply) {
          ticket.history.push({ role: 'user', text: message.content });
          ticket.history.push({ role: 'assistant', text: aiReply });
          setActiveTicket(message.author.id, ticket);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`escalate_${message.author.id}`)
              .setLabel('Talk to a Staff Member')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('👤')
          );

          const aiEmbed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setAuthor({ name: 'Jump Up Events AI Assistant', iconURL: client.user.displayAvatarURL() })
            .setDescription(aiReply)
            .setFooter({ text: 'AI-powered response' })
            .setTimestamp();

          await message.author.send({ embeds: [aiEmbed], components: [row] });
        }
      }

      return;
    }

    // Staff reply in ticket channel → forward to user DM
    if (message.channel.parentId === client.config.modmailCategoryId) {
      const found = getTicketByChannel(message.channel.id);
      if (found && found.ticket.userId !== message.author.id) {
        found.ticket.mode = 'human';
        setActiveTicket(found.userId, found.ticket);

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setAuthor({ name: `Staff: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
          .setDescription(message.content)
          .setTimestamp();

        try {
          const user = await client.users.fetch(found.ticket.userId);
          await user.send({ embeds: [embed] });
        } catch {
          // DMs closed
        }
      }
    }
  },
};
