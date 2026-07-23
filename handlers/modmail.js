const { ChannelType, PermissionsBitField } = require('discord.js');

const activeTickets = new Map();

async function createTicket(user, guild, client) {
  if (activeTickets.has(user.id)) {
    const existing = activeTickets.get(user.id);
    const channel = guild.channels.cache.get(existing.channelId);
    if (channel) {
      await user.send('You already have an open ticket! Please continue in your existing channel.');
      return;
    }
    activeTickets.delete(user.id);
  }

  const categoryId = client.config.modmailCategoryId;
  const category = guild.channels.cache.get(categoryId);
  if (!category) {
    await user.send('Support is currently unavailable. Please try again later.');
    return;
  }

  const channel = await guild.channels.create({
    name: `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: client.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
    ],
  });

  for (const member of guild.members.cache.values()) {
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await channel.permissionOverwrites.create(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    }
  }

  activeTickets.set(user.id, { channelId: channel.id, userId: user.id, mode: 'ai', history: [] });

  await channel.send({
    content: `**New Support Ticket**\n**User:** ${user.tag} (${user.id})\n\nA support team member will be with you shortly. Please describe your issue in this channel.`,
  });

  const admins = guild.members.cache.filter(m => m.permissions.has(PermissionsBitField.Flags.Administrator) && !m.user.bot);
  for (const admin of admins.values()) {
    try {
      await admin.send(`**New Modmail Ticket**\n${user.tag} has opened a support ticket.\nChannel: ${channel}`);
    } catch {
      // Admin may have DMs closed
    }
  }

  await user.send(`Your ticket has been created! A support team member will assist you soon.`);
}

async function closeTicket(userId, guild, client) {
  const ticket = activeTickets.get(userId);
  if (!ticket) return false;

  const channel = guild.channels.cache.get(ticket.channelId);
  if (channel) {
    await channel.send('This ticket is now closed. The channel will be deleted shortly.');
    setTimeout(async () => {
      try {
        await channel.delete();
      } catch {
        // already deleted
      }
    }, 5000);
  }

  activeTickets.delete(userId);
  return true;
}

function getActiveTicket(userId) {
  return activeTickets.get(userId);
}

function setActiveTicket(userId, data) {
  activeTickets.set(userId, data);
}

function deleteActiveTicket(userId) {
  activeTickets.delete(userId);
}

function getTicketByChannel(channelId) {
  for (const [userId, ticket] of activeTickets) {
    if (ticket.channelId === channelId) return { userId, ticket };
  }
  return null;
}

module.exports = { createTicket, closeTicket, getActiveTicket, setActiveTicket, deleteActiveTicket, getTicketByChannel };
