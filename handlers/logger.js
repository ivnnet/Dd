const { EmbedBuilder } = require('discord.js');

async function sendLog(guild, client, embed) {
  const logChannelId = client.config.logChannelId;
  if (!logChannelId) return;
  const channel = guild.channels.cache.get(logChannelId);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch {
    // log channel invalid
  }
}

function createLogEmbed(title, description, color = 0x2b2d31) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

module.exports = { sendLog, createLogEmbed };
