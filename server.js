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

const app = express();
const DISCORD_API = 'https://discord.com/api/v10';

async function discordApi(path, options = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${config.token}`, 'Content-Type': 'application/json', ...options.headers },
    ...options,
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
    const channel = await discordApi(`/channels/${channelId}`);
    const member = await discordApi(`/guilds/${config.guildId}/members/${req.user.id}`);
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

app.get('/api/strikes/:userId', isAuthenticated, isAdmin, (req, res) => {
  const strikes = require('./handlers/strikes');
  const data = strikes.getStrikes(req.params.userId, config.guildId);
  res.json(data.map(s => ({ ...s, privateReason: s.privateReason || '' })));
});

app.get('/api/strikes', isAuthenticated, isAdmin, (req, res) => {
  const strikes = require('./handlers/strikes');
  res.json(strikes.getAllStrikes().map(s => ({ ...s, privateReason: s.privateReason || '' })));
});

app.post('/api/strikes', isAuthenticated, isAdmin, restrictMutation, (req, res) => {
  const { userId, publicReason, privateReason } = req.body;
  if (!userId || !publicReason) {
    return res.status(400).json({ error: 'userId and publicReason are required.' });
  }
  const strikes = require('./handlers/strikes');
  const id = strikes.addStrike(userId, config.guildId, req.user.id, publicReason, privateReason || '');
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

app.get('/api/actions/kick', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const member = await discordApi(`/guilds/${config.guildId}/members/${userId}`);
    if (!member) return res.status(404).json({ error: 'User not in server.' });
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
      body: JSON.stringify({ reason: reason || 'No reason provided.' }),
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/ban', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason, deleteDays } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
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
      body: JSON.stringify({ reason: reason || 'No reason provided.', delete_message_days: parseInt(deleteDays) || 0 }),
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/unban', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
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
    await discordApi(`/guilds/${config.guildId}/bans/${userId}`, { method: 'DELETE' });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
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
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
    res.json({ success: true, until: communicationDisabledUntil });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/actions/unmute', isAuthenticated, isAdmin, restrictMutation, async (req, res) => {
  try {
    const { userId, reason } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
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
    });
    const logChannelId = config.logChannelId;
    if (logChannelId) {
      try { await discordApi(`/channels/${logChannelId}/messages`, { method: 'POST', body: JSON.stringify(logEmbed) }); } catch {}
    }
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
    const strikeId = strikes.addStrike(userId, config.guildId, req.user.id, publicReason, privateReason || '');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard running on port ${PORT}`);
});
