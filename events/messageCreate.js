const { EmbedBuilder } = require('discord.js');
const { createTicket, getActiveTicket, setActiveTicket, getTicketByChannel } = require('../handlers/modmail');

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
