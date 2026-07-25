const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createTicket, getActiveTicket, setActiveTicket, getTicketByChannel } = require('../handlers/modmail');
const groq = require('../handlers/groq');

const processedMessages = new Set();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    if (processedMessages.size > 1000) {
      const first = processedMessages.values().next().value;
      processedMessages.delete(first);
    }

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

      let channel = guild.channels.cache.get(ticket.channelId);
      if (!channel) {
        try {
          channel = await client.channels.fetch(ticket.channelId);
        } catch {
          await message.author.send('Your ticket channel is unavailable. A new one will be created.');
          ticket = null;
        }
      }
      if (!channel) {
        await createTicket(message.author, guild, client);
        ticket = getActiveTicket(message.author.id);
        if (!ticket) return;
        channel = guild.channels.cache.get(ticket.channelId);
        if (!channel) return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content)
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      try { await message.react('✅'); } catch {}

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

          try {
            await message.author.send({ embeds: [aiEmbed], components: [row] });
          } catch (err) {
            console.error('Failed to send AI response to DM:', err.message);
          }

          try {
            await channel.send({ embeds: [aiEmbed] });
          } catch (err) {
            console.error(`Failed to send AI response to channel ${ticket.channelId}:`, err.message);
          }
        }
      } else if (ticket.mode === 'ai' && !groq.isReady()) {
        ticket.mode = 'human';
        setActiveTicket(message.author.id, ticket);
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

        try { await message.react('✅'); } catch {}
      }
    }
  },
};
