const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const config = {};

for (const [key, value] of Object.entries(configFile)) {
  if (typeof value === "string" && value.startsWith("ENV:")) {
    config[key] = process.env[value.replace("ENV:", "")];
  } else {
    config[key] = value;
  }
};


const app = express();

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
    const guildId = config.guildId;
    const member = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.id}`, {
      headers: { Authorization: `Bot ${config.token}` },
    });
    const data = await member.json();
    if (data.roles && data.roles.includes(config.adminRoleId)) return next();
    return res.status(403).send('You need the admin role to access this panel.');
  } catch {
    return res.status(403).send('Could not verify admin status.');
  }
}

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

app.get('/dashboard', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/tickets', isAuthenticated, isAdmin, (req, res) => {
  const modmail = require('./handlers/modmail');
  res.json(modmail.getAllTickets());
});

app.post('/api/tickets/:userId/reply', isAuthenticated, isAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  const modmail = require('./handlers/modmail');
  const success = await modmail.replyToTicket(req.params.userId, message, req.user.username);
  if (!success) return res.status(404).json({ error: 'No active ticket found.' });
  res.json({ success: true });
});

app.post('/api/tickets/:userId/close', isAuthenticated, isAdmin, async (req, res) => {
  const modmail = require('./handlers/modmail');
  const success = await modmail.closeTicketFromDashboard(req.params.userId);
  if (!success) return res.status(404).json({ error: 'No active ticket found.' });
  res.json({ success: true });
});

app.get('/LICENSE', (req, res) => {
  res.sendFile(path.join(__dirname, 'LICENSE'));
});

app.listen(config.port, () => {
  console.log(`Dashboard running on ${config.dashboardUrl}`);
});
