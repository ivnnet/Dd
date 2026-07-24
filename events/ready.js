const { rebuildActiveTickets } = require('../handlers/modmail');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Jump Up Events', { type: 3 });

    const guild = client.guilds.cache.get(client.config.guildId);
    if (guild && client.config.modmailCategoryId) {
      rebuildActiveTickets(guild, client, client.config.modmailCategoryId);
      console.log('Active tickets rebuilt from existing channels.');
    }
  },
};
