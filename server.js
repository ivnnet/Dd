const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const configRaw = require('./config.json');
const config = {};
for (const [key, value] of Object.entries(configRaw)) {
  if (typeof value === 'string' && value.startsWith('ENV:')) {
    config[key] = process.env[value.replace('ENV:', '')];
  } else {
    config[key] = value;
  }
}

const OWNER_IDS = ['894158323040022548', '1329357514827104266'];
const VISITOR_IDS = (process.env.VISITOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const LOGO_URL = process.env.LOGO_URL || 'https://i.ibb.co/Cp40w5YY/icon-1.png';
const APP_WEBHOOK_URL = 'https://discord.com/api/webhooks/1529703702892515339/iRvBul3Ho8z42kNpuZr42_Arn-EU9jIe3KcrYGsFeCfm1PpY9A3yPqqq5K7-Coyp4E4c';
let GUILD_NAME = 'the server';
const auditLog = require('./handlers/auditLog');
const db = require('./handlers/database');
const Application = require('./models/Application');
const Submission = require('./models/Submission');

const app = express();
const DISCORD_API = 'https://discord.com/api/v10';

async function discordApi(path, options = {}) {
  const headers = { Authorization: `Bot ${config.token}`, ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${res.status}: ${text}`);
  }
  return res.json();
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
  clientID: config.clientId,
  clientSecret: config.clientSecret,
  callbackURL: `${config.dashboardUrl}/auth/callback`,
  scope: ['identify', 'guilds', 'guilds.members.read'],
}, (accessToken, refreshToken, profile, done) => {
  process.nextTick(() => done(null, profile));
}));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.redirect('/auth/discord');
}

function isVisitor(req) {
  return req.user && VISITOR_IDS.includes(req.user.id);
}

function isOwner(req) {
  return req.user && OWNER_IDS.includes(req.user.id);
}

async function isAdmin(req, res, next) {
  if (!req.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.redirect('/auth/discord');
  }

  if (isOwner(req) || isVisitor(req)) return next();

  try {
    const channelId = '1529409393584504983';
    let member;
    try {
      member = await discordApi(`/guilds/${config.guildId}/members/${req.user.id}`);
    } catch {
      return res.status(403).json({ error: 'You are not a member of this server.' });
    }
    const channel = await discordApi(`/channels/${channelId}`);
    const roles = await discordApi(`/guilds/${config.guildId}/roles`);

    let permissions = BigInt(0);
    const everyoneRole = roles.find(r => r.id === config.guildId);
    if (everyoneRole) {
      permissions |= BigInt(everyoneRole.permissions);
    }
    for (const roleId of member.roles) {
      const role = roles.find(r => r.id === roleId);
      if (role) {
        permissions |= BigInt(role.permissions);
      }
    }
    if ((permissions & BigInt(8)) === BigInt(8)) return next();
    for (const overwrite of channel.permission_overwrites || []) {
      if (overwrite.id === req.user.id || member.roles.includes(overwrite.id)) {
        permissions &= ~BigInt(overwrite.deny || '0');
        permissions |= BigInt(overwrite.allow || '0');
      }
    }
    const viewChannel = BigInt(0x400);
    if ((permissions & viewChannel) === viewChannel) return next();
    return res.status(403).json({ error: 'You cannot view the required channel.' });
  } catch (err) {
    console.error(err);
    return res.status(403).json({ error: 'Could not verify channel permissions.' });
  }
}

function restrictMutation(req, res, next) {
  if (isVisitor(req)) {
    return res.status(403).json({ error: 'Visitors cannot perform mutations.' });
  }
  next();
}

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => res.redirect('/dashboard')
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/api/config', (req, res) => {
  res.json({ logoUrl: LOGO_URL });
});

app.get('/api/me', isAuthenticated, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    avatar: req.user.avatar,
    isOwner: isOwner(req),
    isVisitor: isVisitor(req),
  });
});

app.get('/api/strikes/:userId', isAuthenticated, isAdmin, async (req, res) => {
  const strikes = require('./handlers/strikes');
  const data = await strikes.getStrikes(req.params.userId, config.guildId);
  res.json(data.map(s => ({ ...s, privateReason: s.privateReason || '' })));
});

app.get('/api/strikes', isAuthenticated, isAdmin, async (req, res) => {
  const strikes = require('./handlers/strikes');
  const data = await strikes.getAllStrikes(config.guildId);
  res.json(data.map(s => ({ ...s, privateReason: s.privateReason || '' })));
});

app.post('/api/strikes', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  const { userId, publicReason, privateReason } = req.body;
  if (!userId || !publicReason) {
    return res.status(400).json({ error: 'userId and publicReason are required.' });
  }
  const strikes = require('./handlers/strikes');
  const id = await strikes.addStrike(userId, config.guildId, req.user.id, publicReason, privateReason || '');
  auditLog.logAction('strike', {
    userId, guildId: config.guildId, moderatorId: req.user.id, reason: publicReason,
    details: { privateReason, strikeId: id, source: 'web' },
  });
  res.json({ strikeId: id });
});

app.get('/api/modmail/tickets', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const channels = await discordApi(`/guilds/${config.guildId}/channels`);
    const ticketChannels = channels.filter(c => c.parent_id === config.modmailCategoryId && c.type === 0);
    const tickets = await Promise.all(ticketChannels.map(async (ch) => {
      try {
        const msgs = await discordApi(`/channels/${ch.id}/messages?limit=1`);
        const last = msgs[0] || null;
        let userName = ch.name.replace('ticket-', '');
        let userId = '';
        if (last && last.embeds && last.embeds[0] && last.embeds[0].description) {
          const match = last.embeds[0].description.match(/\((\d{17,})\)/);
          if (match) userId = match[1];
        }
        if (!userId) {
          const historyMsgs = await discordApi(`/channels/${ch.id}/messages?limit=5`);
          for (const msg of historyMsgs) {
            if (msg.embeds && msg.embeds[0] && msg.embeds[0].description) {
              const match = msg.embeds[0].description.match(/\((\d{17,})\)/);
              if (match) { userId = match[1]; break; }
            }
          }
        }
        return {
          channelId: ch.id,
          name: ch.name,
          userName,
          userId,
          lastActivity: last ? last.timestamp : ch.last_message_timestamp || ch.id,
          lastMessage: last ? (last.content || last.embeds?.[0]?.description || '') : '',
          mode: 'human',
        };
      } catch { return null; }
    }));
    const ticketsWithMessages = tickets.filter(Boolean).sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));
    const modmail = require('./handlers/modmail');
    const activeTickets = modmail.getAllTickets();
    for (const t of activeTickets) {
      const existing = ticketsWithMessages.find(x => x.channelId === t.channelId || x.userId === t.userId);
      if (existing) {
        existing.mode = t.mode;
      }
    }
    res.json(ticketsWithMessages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/modmail/tickets/:channelId/messages', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const messages = await discordApi(`/channels/${req.params.channelId}/messages?limit=100`);
    res.json(messages.reverse().map(m => ({
      id: m.id,
      author: m.author.username,
      authorId: m.author.id,
      authorAvatar: m.author.avatar ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png` : null,
      content: m.content || (m.embeds?.[0]?.description || ''),
      timestamp: m.timestamp,
      isBot: m.author.bot,
      isStaff: m.embeds?.[0]?.author?.name?.startsWith('Staff:') || false,
      embedAuthor: m.embeds?.[0]?.author?.name || null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/modmail/tickets/:channelId/reply', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { content, userId } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    const embed = {
      embeds: [{
        color: 0x2ecc71,
        author: { name: `Staff: ${req.user.username}`, icon_url: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` },
        description: content,
        timestamp: new Date().toISOString(),
      }]
    };
    const msg = await discordApi(`/channels/${req.params.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(embed),
    });
    const modmail = require('./handlers/modmail');
    const ticket = modmail.getTicketByChannel(req.params.channelId);
    if (ticket) {
      ticket.ticket.mode = 'human';
      modmail.setActiveTicket(ticket.userId, ticket.ticket);
    }
    if (userId) {
      try {
        const dm = {
          embeds: [{
            color: 0x2ecc71,
            author: { name: `Staff: ${req.user.username}`, icon_url: `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` },
            description: content,
            timestamp: new Date().toISOString(),
          }]
        };
        const user = await discordApi(`/users/${userId}`);
        const dmChannel = await discordApi(`/users/@me/channels`, {
          method: 'POST',
          body: JSON.stringify({ recipient_id: userId }),
        });
        await discordApi(`/channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: JSON.stringify(dm),
        });
      } catch {}
    }
    if (msg && msg.id) {
      try {
        await discordApi(`/channels/${req.params.channelId}/messages/${msg.id}/reactions/✅/@me`, { method: 'PUT' });
      } catch {}
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/modmail/tickets/:channelId/close', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    let userId = null;
    try {
      const modmail = require('./handlers/modmail');
      const ticket = modmail.getTicketByChannel(req.params.channelId);
      if (ticket) userId = ticket.userId;
      if (!userId) {
        const msgs = await discordApi(`/channels/${req.params.channelId}/messages?limit=20`);
        for (const msg of msgs) {
          if (msg.embeds && msg.embeds[0] && msg.embeds[0].description) {
            const match = msg.embeds[0].description.match(/\((\d{17,})\)/);
            if (match) { userId = match[1]; break; }
          }
        }
      }
      if (userId) {
        try {
          const allMsgs = await discordApi(`/channels/${req.params.channelId}/messages?limit=100`);
          const pastebin = require('./handlers/pastebin');
          const lines = allMsgs.reverse().map(m => {
            const author = m.author?.bot ? 'AI/Staff' : (m.author?.username || 'User');
            return `[${new Date(m.timestamp).toLocaleString()}] ${author}: ${m.content || (m.embeds?.[0]?.description || '(no content)')}`;
          }).join('\n');
          const header = `Ticket Transcript\nUser: <@${userId}>\nChannel: ${req.params.channelId}\nClosed: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
          const transcriptUrl = await pastebin.upload(header + lines);
          if (transcriptUrl && db.isReady()) {
            const Transcript = require('./models/Transcript');
            const transcript = new Transcript({
              ticketId: req.params.channelId,
              userId,
              userTag: `<@${userId}>`,
              channelId: req.params.channelId,
              channelName: `ticket-${userId}`,
              url: transcriptUrl,
            });
            await transcript.save();
            auditLog.logAction('ticket_closed', {
              userId, guildId: config.guildId, moderatorId: req.user.id,
              details: { channelId: req.params.channelId, transcriptUrl, source: 'web' },
            });
          }
        } catch {}
      }
    } catch {}
    const closeEmbed = {
      embeds: [{
        color: 0xe74c3c,
        title: 'Ticket Closed',
        description: 'This ticket has been closed by a staff member. The channel will be deleted shortly.',
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/channels/${req.params.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(closeEmbed),
    });
    setTimeout(async () => {
      try { await discordApi(`/channels/${req.params.channelId}`, { method: 'DELETE' }); } catch {}
    }, 3000);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/modmail/tickets/:channelId/toggle-mode', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { mode } = req.body;
    const modmail = require('./handlers/modmail');
    const ticket = modmail.getTicketByChannel(req.params.channelId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found in active tickets.' });
    ticket.ticket.mode = mode;
    modmail.setActiveTicket(ticket.userId, ticket.ticket);
    await discordApi(`/channels/${req.params.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        embeds: [{
          color: mode === 'ai' ? 0x9b59b6 : 0x2ecc71,
          title: mode === 'ai' ? 'AI Mode Activated' : 'Human Mode Activated',
          description: mode === 'ai'
            ? 'This ticket has been switched to AI-assisted mode.'
            : 'This ticket has been switched to human-handled mode.',
          timestamp: new Date().toISOString(),
        }]
      }),
    });
    res.json({ success: true, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/modmail/tickets/:channelId/user', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const modmail = require('./handlers/modmail');
    const ticket = modmail.getTicketByChannel(req.params.channelId);
    if (!ticket) return res.json({ mode: 'human' });
    res.json({ mode: ticket.ticket.mode, userId: ticket.userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function sendUserDM(userId, embed) {
  try {
    const dmChannel = await discordApi(`/users/@me/channels`, {
      method: 'POST',
      body: JSON.stringify({ recipient_id: userId }),
    });
    await discordApi(`/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {}
}

app.get('/api/actions/kick', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    try {
      await discordApi(`/guilds/${config.guildId}/members/${userId}`);
    } catch {
      return res.status(404).json({ error: 'User not in server.' });
    }
    const dmEmbed = {
      color: 0xe74c3c,
      title: `Kicked from ${GUILD_NAME}`,
      description: `**Reason:** ${reason || 'No reason provided.'}`,
      timestamp: new Date().toISOString(),
    };
    const logEmbed = {
      embeds: [{
        color: 0xe74c3c,
        title: 'Member Kicked (Web)',
        description: `<@${userId}> was kicked.`,
        fields: [
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided.' },
        ],
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/guilds/${config.guildId}/members/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Audit-Log-Reason': reason || 'No reason provided.' },
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('kick', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: reason || '', details: { source: 'web' } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/ban', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason, deleteDays } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const dmEmbed = {
      color: 0xe74c3c,
      title: `Banned from ${GUILD_NAME}`,
      description: `**Reason:** ${reason || 'No reason provided.'}`,
      timestamp: new Date().toISOString(),
    };
    const logEmbed = {
      embeds: [{
        color: 0xe74c3c,
        title: 'Member Banned (Web)',
        fields: [
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided.' },
          { name: 'Messages Deleted', value: `${deleteDays || 0} day(s)` },
        ],
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/guilds/${config.guildId}/bans/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ delete_message_days: parseInt(deleteDays) || 0 }),
      headers: { 'X-Audit-Log-Reason': reason || 'No reason provided.' },
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('ban', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: reason || '', details: { deleteDays: deleteDays || 0, source: 'web' } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/unban', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const dmEmbed = {
      color: 0x2ecc71,
      title: `Unbanned from ${GUILD_NAME}`,
      description: `**Reason:** ${reason || 'No reason provided.'}`,
      timestamp: new Date().toISOString(),
    };
    const logEmbed = {
      embeds: [{
        color: 0x2ecc71,
        title: 'Member Unbanned (Web)',
        fields: [
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided.' },
        ],
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/guilds/${config.guildId}/bans/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Audit-Log-Reason': reason || 'No reason provided.' },
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('unban', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: reason || '', details: { source: 'web' } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/mute', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, duration, reason } = req.query;
    if (!userId || !duration) return res.status(400).json({ error: 'userId and duration are required.' });
    const match = duration.match(/^(\d+)([mhd])$/);
    if (!match) return res.status(400).json({ error: 'Invalid duration. Use format like 10m, 1h, 7d.' });
    const val = parseInt(match[1]);
    const unit = match[2];
    const ms = unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
    const communicationDisabledUntil = new Date(Date.now() + val * ms).toISOString();
    const dmEmbed = {
      color: 0xf39c12,
      title: `Timed Out in ${GUILD_NAME}`,
      description: `**Duration:** ${duration}\n**Reason:** ${reason || 'No reason provided.'}`,
      timestamp: new Date().toISOString(),
    };
    const logEmbed = {
      embeds: [{
        color: 0xf39c12,
        title: 'Member Timed Out (Web)',
        fields: [
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
          { name: 'Duration', value: duration },
          { name: 'Reason', value: reason || 'No reason provided.' },
        ],
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/guilds/${config.guildId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ communication_disabled_until: communicationDisabledUntil }),
      headers: { 'X-Audit-Log-Reason': reason || 'No reason provided.' },
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('mute', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: reason || '', details: { duration, source: 'web' } });
    res.json({ success: true, until: communicationDisabledUntil });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/unmute', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const dmEmbed = {
      color: 0x2ecc71,
      title: `Timeout Removed in ${GUILD_NAME}`,
      description: `**Reason:** ${reason || 'No reason provided.'}`,
      timestamp: new Date().toISOString(),
    };
    const logEmbed = {
      embeds: [{
        color: 0x2ecc71,
        title: 'Timeout Removed (Web)',
        fields: [
          { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
          { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
          { name: 'Reason', value: reason || 'No reason provided.' },
        ],
        timestamp: new Date().toISOString(),
      }]
    };
    await discordApi(`/guilds/${config.guildId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ communication_disabled_until: null }),
      headers: { 'X-Audit-Log-Reason': reason || 'No reason provided.' },
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('unmute', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: reason || '', details: { source: 'web' } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/lookup', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    let userData = null;
    let memberData = null;
    try { userData = await discordApi(`/users/${userId}`); } catch {}
    try { memberData = await discordApi(`/guilds/${config.guildId}/members/${userId}`); } catch {}
    res.json({ user: userData, member: memberData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/strike', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, publicReason, privateReason } = req.query;
    if (!userId || !publicReason) return res.status(400).json({ error: 'userId and publicReason are required.' });
    const strikes = require('./handlers/strikes');
    const strikeId = await strikes.addStrike(userId, config.guildId, req.user.id, publicReason, privateReason || '');
    const dmEmbed = {
      color: 0xe74c3c,
      title: `Strike #${strikeId} Issued`,
      description: `You have received a strike.\n**Reason:** ${publicReason}\n**Strike ID:** #${strikeId}`,
      timestamp: new Date().toISOString(),
    };

    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try {
        await discordApi(`/channels/${logChannelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            embeds: [{
              color: 0xe74c3c,
              title: 'Strike Issued (Web)',
              fields: [
                { name: 'User', value: `<@${userId}> (${userId})`, inline: true },
                { name: 'Moderator', value: `<@${req.user.id}>`, inline: true },
                { name: 'Public Reason', value: publicReason },
                { name: 'Private Reason', value: privateReason || 'None' },
                { name: 'Strike ID', value: `#${strikeId}` },
              ],
              timestamp: new Date().toISOString(),
            }]
          }),
        });
      } catch {}
    }
    sendUserDM(userId, dmEmbed);
    auditLog.logAction('strike', { userId, guildId: config.guildId, moderatorId: req.user.id, reason: publicReason, details: { privateReason, strikeId, source: 'web' } });
    res.json({ success: true, strikeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/visitors', isAuthenticated, isAdmin, (req, res) => {
  res.json({ visitors: VISITOR_IDS, isOwner: isOwner(req) });
});

app.post('/api/admin/visitors', isAuthenticated, isAdmin, (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can manage visitors.' });
  const { userId, action } = req.body;
  if (!userId || !action) return res.status(400).json({ error: 'userId and action (add/remove) are required.' });
  if (action === 'add' && !VISITOR_IDS.includes(userId)) {
    VISITOR_IDS.push(userId);
  } else if (action === 'remove') {
    const idx = VISITOR_IDS.indexOf(userId);
    if (idx !== -1) VISITOR_IDS.splice(idx, 1);
  }
  res.json({ success: true, visitors: VISITOR_IDS });
});

app.post('/api/admin/kill-session', isAuthenticated, isAdmin, (req, res) => {
  if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can terminate sessions.' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required.' });
  if (req.sessionStore && typeof req.sessionStore.destroy === 'function') {
    req.sessionStore.all((err, sessions) => {
      if (err) return res.status(500).json({ error: 'Failed to enumerate sessions.' });
      let killed = 0;
      if (sessions) {
        for (const [sid, sess] of Object.entries(sessions)) {
          if (sess.passport && sess.passport.user && sess.passport.user.id === userId) {
            req.sessionStore.destroy(sid, () => {});
            killed++;
          }
        }
      }
      res.json({ success: true, killed });
    });
  } else {
    res.json({ success: true, note: 'MemoryStore does not support enumeration. Session will expire naturally.' });
  }
});

app.get('/api/applications', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const apps = await Application.find().sort({ createdAt: -1 }).lean();
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/applications', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can create applications.' });
    const { title, description, questions } = req.body;
    if (!title || !questions || !questions.length) {
      return res.status(400).json({ error: 'Title and at least one question are required.' });
    }
    const app = new Application({ title, description, questions, createdBy: req.user.id });
    await app.save();
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/applications/:id', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can edit applications.' });
    const app = await Application.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!app) return res.status(404).json({ error: 'Application not found.' });
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/applications/:id', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can delete applications.' });
    await Application.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/applications/:id/submissions', isAuthenticated, isAdmin, async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only owners can view submissions.' });
    const subs = await Submission.find({ applicationId: req.params.id }).sort({ submittedAt: -1 }).lean();
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/applications/public/:id', async (req, res) => {
  try {
    const app = await Application.findById(req.params.id).lean();
    if (!app || !app.active) return res.status(404).json({ error: 'Application not found or inactive.' });
    res.json({ title: app.title, description: app.description, questions: app.questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/applications/public/:id/submit', async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app || !app.active) return res.status(404).json({ error: 'Application not found or inactive.' });
    const { answers } = req.body;
    if (!answers || !answers.length) {
      return res.status(400).json({ error: 'Answers are required.' });
    }
    const sub = new Submission({ applicationId: app._id, answers });
    await sub.save();

    try {
      const body = JSON.stringify({
        embeds: [{
          color: 0x9b59b6,
          title: app.title,
          description: answers.map(a => `**${a.question}**\n${a.answer}`).join('\n\n'),
          footer: { text: `Submission #${sub._id}` },
          timestamp: new Date().toISOString(),
        }]
      });
      const urlObj = new URL(APP_WEBHOOK_URL);
      const https = require('https');
      const r = https.request({ hostname: urlObj.hostname, path: urlObj.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
      r.write(body);
      r.end();
    } catch {}

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/apply/:id', async (req, res) => {
  try {
    const app = await Application.findById(req.params.id).lean();
    if (!app || !app.active) return res.status(404).send('Application not found.');
    const questionsJson = JSON.stringify(app.questions);
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${app.title} — Apply</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f0f13; color:#e1e1e6; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
.card { background:#1a1a22; border:1px solid #2a2a35; border-radius:12px; padding:32px; max-width:640px; width:100%; }
h1 { font-size:24px; font-weight:700; margin-bottom:8px; }
p.desc { color:#9d9daf; font-size:14px; line-height:1.6; margin-bottom:24px; }
.form-group { margin-bottom:20px; }
label { display:block; font-size:13px; color:#9d9daf; margin-bottom:6px; font-weight:500; }
label .required { color:#ed4245; }
input, textarea, select { width:100%; padding:10px 14px; background:#0f0f13; border:1px solid #2a2a35; border-radius:8px; color:#e1e1e6; font-size:15px; font-family:inherit; transition:border-color 0.2s; }
input:focus, textarea:focus, select:focus { outline:none; border-color:#9b59b6; }
textarea { resize:vertical; min-height:80px; }
.btn { width:100%; padding:12px; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; background:#9b59b6; color:white; transition:background 0.2s; }
.btn:hover { background:#8e44ad; }
.btn:disabled { opacity:0.5; cursor:not-allowed; }
.alert { padding:12px 16px; border-radius:8px; margin-bottom:20px; font-size:14px; display:none; }
.alert-success { background:#1a3327; border:1px solid #2d6a4f; color:#95d5b2; }
.alert-error { background:#3a1a1a; border:1px solid #6a2d2d; color:#d59595; }
.loading { text-align:center; padding:40px; color:#9d9daf; }
@media (max-width:480px) { .card { padding:20px; } h1 { font-size:20px; } }
</style>
</head>
<body>
<div class="card" id="app">
  <div class="loading">Loading application...</div>
</div>
<script>
const API = window.location.origin;
const appId = '${req.params.id}';
const questions = ${questionsJson};

function buildForm() {
  const title = ${JSON.stringify(app.title)};
  const desc = ${JSON.stringify(app.description || '')};
  let html = '<h1>' + title + '</h1>';
  if (desc) html += '<p class="desc">' + desc.replace(/\\n/g, '<br>') + '</p>';
  html += '<div id="alert" class="alert"></div>';
  questions.forEach((q, i) => {
    const req = q.required ? ' <span class="required">*</span>' : '';
    html += '<div class="form-group">';
    html += '<label for="q' + i + '">' + q.question + req + '</label>';
    if (q.type === 'textarea') {
      html += '<textarea id="q' + i + '" rows="4"' + (q.required ? ' required' : '') + '></textarea>';
    } else if (q.type === 'select' && q.options) {
      html += '<select id="q' + i + '"' + (q.required ? ' required' : '') + '>';
      html += '<option value="">Select...</option>';
      q.options.forEach(o => { html += '<option value="' + o + '">' + o + '</option>'; });
      html += '</select>';
    } else {
      html += '<input type="text" id="q' + i + '"' + (q.required ? ' required' : '') + '>';
    }
    html += '</div>';
  });
  html += '<button class="btn" id="submitBtn" onclick="submitApp()">Submit Application</button>';
  document.getElementById('app').innerHTML = html;
}

async function submitApp() {
  const btn = document.getElementById('submitBtn');
  const alert = document.getElementById('alert');
  const answers = [];
  let valid = true;
  questions.forEach((q, i) => {
    const el = document.getElementById('q' + i);
    const val = el ? el.value.trim() : '';
    if (q.required && !val) { valid = false; el.style.borderColor = '#ed4245'; }
    else if (el) el.style.borderColor = '';
    answers.push({ question: q.question, answer: val || '(no answer)' });
  });
  if (!valid) {
    alert.className = 'alert alert-error';
    alert.textContent = 'Please fill in all required fields.';
    alert.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const res = await fetch(API + '/api/applications/public/' + appId + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (res.ok) {
      document.getElementById('app').innerHTML = '<div style="text-align:center;padding:40px"><h1 style="color:#95d5b2;margin-bottom:16px">Application Submitted</h1><p style="color:#9d9daf">Thank you! Your application has been received and will be reviewed shortly.</p></div>';
    } else {
      const d = await res.json();
      alert.className = 'alert alert-error';
      alert.textContent = d.error || 'Submission failed.';
      alert.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Submit Application';
    }
  } catch {
    alert.className = 'alert alert-error';
    alert.textContent = 'Network error. Please try again.';
    alert.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit Application';
  }
}

buildForm();
</script>
</body>
</html>`);
  } catch (err) {
    res.status(500).send('Error loading application.');
  }
});

app.get('/api/audit', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { userId, action, limit } = req.query;
    let logs;
    if (userId) {
      logs = await auditLog.getAuditLogsByUser(config.guildId, userId);
    } else {
      logs = await auditLog.getAuditLogs(config.guildId, {});
    }
    if (action) logs = logs.filter(l => l.action === action);
    if (limit) logs = logs.slice(0, parseInt(limit));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/transcripts/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const Transcript = require('./models/Transcript');
    const transcript = await Transcript.findById(req.params.id).lean();
    if (!transcript) return res.status(404).send('Transcript not found');
    if (transcript.url) return res.redirect(transcript.url);
    res.status(404).send('Transcript has no URL.');
  } catch (err) {
    res.status(500).send('Error loading transcript');
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ error: 'Internal server error.' });
  } else {
    res.status(500).send('Internal server error.');
  }
});

app.get('/LICENSE', (req, res) => {
  res.sendFile(path.join(__dirname, 'LICENSE'));
});

function serveDashboard(req, res) {
  const filePath = path.join(__dirname, 'public', 'dashboard.html');
  const fs = require('fs');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('LOGO_URL_PLACEHOLDER', LOGO_URL);
  res.send(html);
}

app.get('/dashboard', isAuthenticated, isAdmin, serveDashboard);

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  serveDashboard(req, res);
});

const PORT = process.env.PORT || config.dashboardPort || 3000;

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Dashboard running on port ${PORT}`);
  try {
    const guild = await discordApi(`/guilds/${config.guildId}`);
    GUILD_NAME = guild.name;
    console.log(`Guild: ${GUILD_NAME}`);
  } catch {}
});
