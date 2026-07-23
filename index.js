const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands = new Collection();
client.config = config;
client.strikes = require('./handlers/strikes');

require('./handlers/gemini').init(config.geminiApiKey);

const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const cmd = require(`./commands/${file}`);
  client.commands.set(cmd.data.name, cmd);
}

const eventFiles = fs.readdirSync('./events').filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

client.login(config.token)
  .then(() => {
    console.log(`Bot logged in as ${client.user.tag}`);

    // Start dashboard/server after bot is online
    require('./server');
  })
  .catch(err => {
    console.error('Bot login failed:', err);
  });

module.exports = client;
