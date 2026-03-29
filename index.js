const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CLIENT_ID = '1138806788708368544';
const TOKEN = process.env.TOKEN;
const DATA_FILE = './flights.json';

const UPCOMING_FLIGHT_IMAGE = 'https://media.discordapp.net/attachments/1487215768188883044/1487246574462435338/Saudia_Upcoming_Flight.png?ex=69c91a8f&is=69c7c90f&hm=93686de71b51add6562458d6fcba6c968dee3cfcfc1395e20242cbf22d5d4e15&=&format=webp&quality=lossless';

// ===== APPROVAL ROLES =====
const APPROVER_ROLES = [
  "OM | Operations Manager",
  "HR | Human Resources",
  "EX | Executive",
  "CO | Chief Officer",
  "S | Saudia",
  "F | Founder"
];

// ===== INIT FILE =====
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Request a flight log')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Event name (e.g. SV637)')
        .setRequired(true)),

  new SlashCommandBuilder().setName('stats').setDescription('Check stats'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Leaderboard'),

  new SlashCommandBuilder()
    .setName('hostflight')
    .setDescription('Host flight')
    .addStringOption(o => o.setName('flight_number').setRequired(true))
    .addStringOption(o => o.setName('from').setRequired(true))
    .addStringOption(o => o.setName('to').setRequired(true))
    .addStringOption(o => o.setName('aircraft').setRequired(true))
    .addStringOption(o => o.setName('date').setRequired(true))
    .addStringOption(o => o.setName('time').setRequired(true))
].map(c => c.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== DATA =====
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch { return {}; }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== MAIN =====
client.on('interactionCreate', async interaction => {

  // ===== SLASH COMMANDS =====
  if (interaction.isChatInputCommand()) {
    const data = loadData();
    const roles = interaction.member.roles.cache;

    // ===== LOGFLIGHT (REQUEST SYSTEM) =====
    if (interaction.commandName === 'logflight') {
      const allowedRoles = ['CP | Captain', 'FO | First Officer'];
      if (!roles.some(r => allowedRoles.includes(r.name))) {
        return interaction.reply({ content: 'Not authorized.', ephemeral: true });
      }

      const event = interaction.options.getString('event');
      const requestChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs-requests');
      if (!requestChannel) return interaction.reply({ content: 'Request channel missing.', ephemeral: true });

      const timestamp = Math.floor(Date.now() / 1000);

      const embed = new EmbedBuilder()
        .setTitle('Flight Log Request')
        .setColor(0x006C35)
        .addFields(
          { name: 'Pilot', value: `<@${interaction.user.id}>` },
          { name: 'Event', value: event },
          { name: 'Time', value: `<t:${timestamp}:f>` }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${interaction.user.id}_${event}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`deny_${interaction.user.id}_${event}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      );

      await requestChannel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: 'Flight log request sent.', ephemeral: true });
    }

    // ===== LEADERBOARD =====
    if (interaction.commandName === 'leaderboard') {
      const leaderboard = Object.entries(data)
        .map(([id, info]) => ({ id, count: info.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const fields = leaderboard.map((p, i) => {
        const member = interaction.guild.members.cache.get(p.id);
        const name = member ? member.displayName : 'Unknown User';
        return { name: `#${i + 1} ${name}`, value: `Flights: ${p.count}` };
      });

      const embed = new EmbedBuilder()
        .setTitle('Leaderboard')
        .setColor(0x006C35)
        .addFields(fields);

      return interaction.reply({ embeds: [embed] });
    }

    // ===== STATS =====
    if (interaction.commandName === 'stats') {
      const user = interaction.user;
      const d = data[user.id] || { count: 0, lastFlight: 'Never' };

      const embed = new EmbedBuilder()
        .setTitle(`Stats: ${user.username}`)
        .setColor(0x006C35)
        .addFields(
          { name: 'Flights', value: `${d.count}`, inline: true },
          {
            name: 'Last Flight',
            value: d.lastFlight === 'Never' ? 'Never' : new Date(d.lastFlight).toLocaleString(),
            inline: true
          }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  // ===== BUTTON HANDLER =====
  if (interaction.isButton()) {
    const roles = interaction.member.roles.cache;
    if (!roles.some(r => APPROVER_ROLES.includes(r.name))) {
      return interaction.reply({ content: 'Not authorized.', ephemeral: true });
    }

    const data = loadData();
    const [action, userId, event] = interaction.customId.split('_');

    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs');

    if (action === 'approve') {
      if (!data[userId]) data[userId] = { count: 0, lastFlight: null };
      data[userId].count++;
      data[userId].lastFlight = new Date().toISOString();
      saveData(data);

      const embedApproved = new EmbedBuilder()
        .setTitle('Flight Approved')
        .setColor(0x006C35)
        .addFields(
          { name: 'Pilot', value: `<@${userId}>` },
          { name: 'Event', value: event }
        );

      const embedLog = new EmbedBuilder()
        .setTitle('Flight Log')
        .setColor(0x006C35)
        .addFields(
          { name: 'Pilot', value: `<@${userId}>` },
          { name: 'Event', value: event },
          { name: 'Total Flights', value: `${data[userId].count}` }
        );

      if (logChannel) logChannel.send({ embeds: [embedLog] });

      return interaction.update({ embeds: [embedApproved], components: [] });
    }

    if (action === 'deny') {
      const embedDenied = new EmbedBuilder()
        .setTitle('Flight Denied')
        .setColor(0xFF0000)
        .setDescription(`Sorry <@${userId}>, your request has been denied.`);

      return interaction.update({ embeds: [embedDenied], components: [] });
    }
  }
});

client.login(TOKEN);
