const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const configRaw = require('./config.json');
const config = {};
for (const [key, value] of Object.entries(configRaw)) {
  if (typeof value === 'string' && value.startsWith('ENV.')) {
    config[key] = process.env[value.replace('ENV.', '')];
  } else {
    config[key] = value;
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('mstrike')
    .setDescription('Issue a strike to a member')
    .addUserOption(option => option.setName('target').setDescription('The member to strike').setRequired(true))
    .addStringOption(option => option.setName('public_reason').setDescription('Public reason for the strike').setRequired(true))
    .addStringOption(option => option.setName('private_reason').setDescription('Private reason (staff only)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('mstrikeremove')
    .setDescription('Remove a specific strike from a member')
    .addUserOption(option => option.setName('target').setDescription('The member').setRequired(true))
    .addIntegerOption(option => option.setName('strike_id').setDescription('The strike number to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('mstrikesearch')
    .setDescription('View strike history for a member')
    .addUserOption(option => option.setName('target').setDescription('The member to look up').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('mkick')
    .setDescription('Kick a member from the server')
    .addUserOption(option => option.setName('target').setDescription('The member to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the kick').setRequired(false))
    .addBooleanOption(option => option.setName('notify').setDescription('Send the user a DM').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('mban')
    .setDescription('Ban a member from the server')
    .addUserOption(option => option.setName('target').setDescription('The member to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the ban').setRequired(false))
    .addIntegerOption(option => option.setName('delete_days').setDescription('Delete messages from the last X days').setRequired(false))
    .addBooleanOption(option => option.setName('notify').setDescription('Send the user a DM').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('munban')
    .setDescription('Unban a user from the server')
    .addStringOption(option => option.setName('user_id').setDescription('The ID of the user to unban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the unban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('mmute')
    .setDescription('Timeout a member')
    .addUserOption(option => option.setName('target').setDescription('The member to timeout').setRequired(true))
    .addStringOption(option => option.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for the timeout').setRequired(false))
    .addBooleanOption(option => option.setName('notify').setDescription('Send the user a DM').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('munmute')
    .setDescription('Remove a timeout from a member')
    .addUserOption(option => option.setName('target').setDescription('The member to remove timeout from').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway')
    .addStringOption(option => option.setName('prize').setDescription('The prize to give away').setRequired(true))
    .addStringOption(option => option.setName('duration').setDescription('Duration (e.g. 1h, 24h, 7d)').setRequired(true))
    .addIntegerOption(option => option.setName('winners').setDescription('Number of winners').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands.map(cmd => cmd.toJSON()),
    });
    console.log('Slash commands registered successfully.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
})();
