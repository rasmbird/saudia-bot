const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CLIENT_ID = '1138806788708368544';
const TOKEN = process.env.TOKEN;
const DATA_FILE = './flights.json';

const APPROVER_ROLES = [
  "OM | Operations Manager",
  "HR | Human Resources",
  "EX | Executive",
  "CO | Chief Officer",
  "S | Saudia",
  "F | Founder"
];

const UPCOMING_FLIGHT_IMAGE = 'https://media.discordapp.net/attachments/1487215768188883044/1487246574462435338/Saudia_Upcoming_Flight.png';

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
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check your flight stats'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top pilots'),

  new SlashCommandBuilder()
    .setName('hostflight')
    .setDescription('Host a flight')
    .addStringOption(o =>
      o.setName('flight_number')
        .setDescription('Flight number (e.g. SV123)')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('from')
        .setDescription('Departure airport')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('to')
        .setDescription('Arrival airport')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('aircraft')
        .setDescription('Aircraft type')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('date')
        .setDescription('Date YYYY-MM-DD')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('time')
        .setDescription('Time HH:MM (KSA)')
        .setRequired(true))
].map(cmd => cmd.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering commands...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('Commands registered.');
  } catch (err) {
    console.error('Register Error:', err);
  }
})();

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== DATA =====
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
  } catch {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== MAIN =====
client.on('interactionCreate', async interaction => {

  // ===== COMMANDS =====
  if (interaction.isChatInputCommand()) {
    const data = loadData();
    const roles = interaction.member.roles.cache;

    // ===== LOGFLIGHT (REQUEST) =====
    if (interaction.commandName === 'logflight') {
      const allowedRoles = ['CP | Captain', 'FO | First Officer'];
      if (!roles.some(r => allowedRoles.includes(r.name))) {
        return interaction.reply({ content: 'Not authorized.', ephemeral: true });
      }

      const event = interaction.options.getString('event');
      const requestChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs-requests');

      if (!requestChannel) {
        return interaction.reply({ content: 'Request channel not found.', ephemeral: true });
      }

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

      return interaction.reply({
        content: 'Flight log request sent.',
        ephemeral: true
      });
    }

    // ===== STATS =====
    if (interaction.commandName === 'stats') {
      const d = data[interaction.user.id] || { count: 0, lastFlight: 'Never' };

      const embed = new EmbedBuilder()
        .setTitle(`Stats: ${interaction.user.username}`)
        .setColor(0x006C35)
        .addFields(
          { name: 'Flights', value: `${d.count}`, inline: true },
          {
            name: 'Last Flight',
            value: d.lastFlight === 'Never'
              ? 'Never'
              : new Date(d.lastFlight).toLocaleString(),
            inline: true
          }
        );

      return interaction.reply({ embeds: [embed], ephemeral: true });
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

        return {
          name: `#${i + 1} ${name}`,
          value: `Flights: ${p.count}`
        };
      });

      const embed = new EmbedBuilder()
        .setTitle('Leaderboard')
        .setColor(0x006C35)
        .addFields(fields);

      return interaction.reply({ embeds: [embed] });
    }

// ===== HOSTFLIGHT =====
if (interaction.commandName === 'hostflight') {
  const requiredRole = 'Flight Operations License';
  if (!roles.some(r => r.name === requiredRole)) {
    return interaction.reply({ content: 'Not authorized.', ephemeral: true });
  }

  const flightNumber = interaction.options.getString('flight_number');
  const from = interaction.options.getString('from');
  const to = interaction.options.getString('to');
  const aircraft = interaction.options.getString('aircraft');
  const date = interaction.options.getString('date');
  const time = interaction.options.getString('time');
  const eventLink = interaction.options.getString('event'); // new input for event link
  const eventName = eventLink.split('event=')[1] ? `SV${eventLink.split('event=')[1].slice(-4)}` : 'Event'; // extract last 4 digits as SV ID

  const [hour, minute] = time.split(':').map(Number);
  const dateTime = new Date(`${date}T${(hour - 3).toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:00Z`);
  const timestamp = Math.floor(dateTime.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle('Upcoming Flights')
    .setColor(0x006C35)
    .setImage(UPCOMING_FLIGHT_IMAGE)
    .addFields({
      name: `Flight ${flightNumber}`,
      value: `Route: ${from} → ${to}\nAircraft: ${aircraft}\nJoin Time: <t:${timestamp}:f>\nHosted By: <@${interaction.user.id}>`
    });

  const button = new ButtonBuilder()
    .setLabel(eventName) // text shown
    .setStyle(ButtonStyle.Link)
    .setURL(eventLink); // clickable link

  const row = new ActionRowBuilder().addComponents(button);

  const channel = interaction.guild.channels.cache.find(c => c.name === 'departures');
  if (!channel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });

  await channel.send({ embeds: [embed], components: [row] });

  return interaction.reply({ content: 'Flight hosted.', ephemeral: true });
}
  }

  // ===== BUTTONS =====
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

      const approvedEmbed = new EmbedBuilder()
        .setTitle('Flight Approved')
        .setColor(0x006C35)
        .setDescription(`<@${userId}> your flight has been approved.`);

      const logEmbed = new EmbedBuilder()
        .setTitle('Flight Log')
        .setColor(0x006C35)
        .addFields(
          { name: 'Pilot', value: `<@${userId}>` },
          { name: 'Event', value: event },
          { name: 'Total Flights', value: `${data[userId].count}` }
        );

      if (logChannel) await logChannel.send({ embeds: [logEmbed] });

      return interaction.update({ embeds: [approvedEmbed], components: [] });
    }

    if (action === 'deny') {
      const deniedEmbed = new EmbedBuilder()
        .setTitle('Flight Denied')
        .setColor(0xFF0000)
        .setDescription(`Sorry <@${userId}>, your request has been denied.`);

      return interaction.update({ embeds: [deniedEmbed], components: [] });
    }
  }
});

client.login(TOKEN);
