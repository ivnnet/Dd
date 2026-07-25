const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog } = require('../handlers/logger');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message.guild) return;

    if (message.partial) {
      try { await message.fetch(); } catch {}
    }

    let channelName = 'unknown';
    try {
      const ch = message.channel?.partial ? await message.channel?.fetch() : message.channel;
      channelName = ch?.name || 'unknown';
    } catch {}

    let authorName = 'Unknown';
    let authorId = '';
    let executorName = null;
    let content = '(no content / embed only)';

    if (message.author) {
      if (message.author.bot) return;
      authorName = `${message.author.tag} (${message.author.id})`;
      authorId = message.author.id;
    }

    if (message.content) {
      content = message.content.slice(0, 1024);
    }

    try {
      const auditLogs = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 });
      const entry = auditLogs.entries.find(e => e.extra?.channel?.id === message.channel?.id);
      if (entry) {
        if (entry.executor) {
          executorName = `${entry.executor.tag} (${entry.executor.id})`;
        }
        if (!message.author && entry.target) {
          if (entry.target?.bot) return;
          authorName = `${entry.target.tag} (${entry.target.id})`;
          authorId = entry.target.id;
        }
      }
    } catch {}

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Message Deleted')
      .addFields(
        { name: 'Channel', value: `#${channelName}` },
        { name: 'Author', value: authorName },
        { name: 'Content', value: content },
      )
      .setTimestamp();

    if (executorName) {
      embed.addFields({ name: 'Deleted By', value: executorName });
    }

    await sendLog(message.guild, client, embed);
  },
};
