const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { closeTicket, getActiveTicket, setActiveTicket } = require('../handlers/modmail');
const groq = require('../handlers/groq');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Error executing ${interaction.commandName}:`, err);
        const reply = { content: 'An error occurred while executing this command.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'close_ticket') {
        const ticket = getActiveTicket(interaction.user.id);
        if (!ticket || ticket.channelId !== interaction.channel.id) {
          return interaction.reply({ content: 'This is not your ticket.', ephemeral: true });
        }
        await closeTicket(interaction.user.id, interaction.guild, client);
        return interaction.reply({ content: 'Closing ticket...', ephemeral: true });
      }

      if (interaction.customId.startsWith('escalate_')) {
        const userId = interaction.customId.replace('escalate_', '');
        const ticket = getActiveTicket(userId);

        if (!ticket) {
          return interaction.reply({ content: 'No active ticket found.', ephemeral: true });
        }

        if (interaction.user.id !== userId) {
          return interaction.reply({ content: 'This button is not for you.', ephemeral: true });
        }

        ticket.mode = 'human';
        setActiveTicket(userId, ticket);

        const guild = client.guilds.cache.get(client.config.guildId);
        if (guild) {
          const channel = guild.channels.cache.get(ticket.channelId);
          if (channel) {
            await channel.send({
              content: `**${interaction.user.tag} has requested to speak with a human staff member.** The AI assistant has been disabled for this ticket.`,
            });
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('Transferred to Staff')
          .setDescription('You have been connected to a human support staff member. They will be with you shortly.')
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: false });
        return;
      }

      return;
    }
  },
};
