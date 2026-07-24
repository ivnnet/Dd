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
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/discord');
}

async function isAdmin(req, res, next) {
  if (!req.user) return res.redirect('/auth/discord');
  try {
    const member = await discordApi(`/guilds/${config.guildId}/members/${req.user.id}`);
    const perms = BigInt(member.permissions || '0');
    const adminPerm = BigInt(8);
    if ((perms & adminPerm) === adminPerm) return next();
    return res.status(403).send('You need Administrator permissions in the server to access this panel.');
  } catch {
    return res.status(403).send('Could not verify admin status.');
  }
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

app.get('/api/me', isAuthenticated, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, avatar: req.user.avatar });
});

app.get('/api/strikes/:userId', isAuthenticated, isAdmin, (req, res) => {
  const strikes = require('./handlers/strikes');
  const data = strikes.getStrikes(req.params.userId, config.guildId);
  res.json(data);
});

app.get('/api/strikes', isAuthenticated, isAdmin, (req, res) => {
  const strikes = require('./handlers/strikes');
  res.json(strikes.getAllStrikes());
});

app.post('/api/strikes', isAuthenticated, isAdmin, (req, res) => {
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
        return {
          channelId: ch.id,
          name: ch.name,
          userName,
          userId,
          lastActivity: last ? last.timestamp : ch.last_message_timestamp,
          lastMessage: last ? (last.content || last.embeds?.[0]?.description || '') : '',
        };
      } catch { return null; }
    }));
    res.json(tickets.filter(Boolean).sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0)));
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

app.post('/api/modmail/tickets/:channelId/reply', isAuthenticated, isAdmin, async (req, res) => {
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
    await discordApi(`/channels/${req.params.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(embed),
    });
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/modmail/tickets/:channelId/close', isAuthenticated, isAdmin, async (req, res) => {
  try {
    await discordApi(`/channels/${req.params.channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'This ticket has been closed by a staff member. Channel will be deleted shortly.' }),
    });
    setTimeout(async () => {
      try { await discordApi(`/channels/${req.params.channelId}`, { method: 'DELETE' }); } catch {}
    }, 3000);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/dashboard', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/LICENSE', (req, res) => {
  res.sendFile(path.join(__dirname, 'LICENSE'));
});

const PORT = process.env.PORT || config.dashboardPort || 3000;

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});