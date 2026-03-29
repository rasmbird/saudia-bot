const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CLIENT_ID = '1138806788708368544';
const TOKEN = process.env.TOKEN;
const FLIGHTS_FILE = './flights.json';
const UPCOMING_FLIGHT_IMAGE = 'https://media.discordapp.net/attachments/1487215768188883044/1487246574462435338/Saudia_Upcoming_Flight.png?ex=69c91a8f&is=69c7c90f&hm=93686de71b51add6562458d6fcba6c968dee3cfcfc1395e20242cbf22d5d4e15&=&format=webp&quality=lossless';

// ===== INITIALIZE DATA FILE =====
if (!fs.existsSync(FLIGHTS_FILE)) fs.writeFileSync(FLIGHTS_FILE, JSON.stringify({}), 'utf-8');

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Select a Discord Event to log')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('hostflight')
    .setDescription('Host a flight')
    .addStringOption(option =>
      option.setName('flight_number')
        .setDescription('Flight Number (e.g. SV123)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('from')
        .setDescription('Departure Airport (e.g. RUH)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('to')
        .setDescription('Arrival Airport (e.g. JED)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('aircraft')
        .setDescription('Aircraft Type (e.g. A321)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('date')
        .setDescription('Date of Flight (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Join Time (HH:MM, 24h format)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('additional_text')
        .setDescription('Optional extra info for the flight')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check total flights logged for a pilot')
    .addUserOption(option =>
      option.setName('pilot')
        .setDescription('Select a pilot')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the flight leaderboard')
].map(cmd => cmd.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ===== BOT READY =====
client.once('ready', () => console.log(`Logged in as ${client.user.tag}`));

// ===== HELPER: LOAD / SAVE =====
function loadData() { return JSON.parse(fs.readFileSync(FLIGHTS_FILE, 'utf-8')); }
function saveData(data) { fs.writeFileSync(FLIGHTS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

// ===== HANDLE INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const data = loadData();
  const roles = interaction.member.roles.cache;

  // -------- LOGFLIGHT --------
  if (interaction.commandName === 'logflight') {
    const allowedRoles = ['CP | Captain', 'FO | First Officer'];
    if (!roles.some(r => allowedRoles.includes(r.name)))
      return interaction.reply({ content: 'You are not authorized to log flights.', ephemeral: true });

    const eventLink = interaction.options.getString('event');
    const eventName = interaction.guild.scheduledEvents.cache.get(eventLink.split('event=')[1])?.name || 'Event';

    const requestChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs-requests');
    if (!requestChannel) return interaction.reply({ content: 'Requests channel not found.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('Flight Log Approval Request')
      .setColor(0x006C35)
      .addFields(
        { name: 'Requested By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Event', value: eventName, inline: true }
      )
      .setFooter({ text: `Role-based approval system` });

    const approveButton = new ButtonBuilder()
      .setCustomId(`approve_${interaction.user.id}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success);
    const denyButton = new ButtonBuilder()
      .setCustomId(`deny_${interaction.user.id}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(approveButton, denyButton);

    await requestChannel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Flight log request sent for approval.', ephemeral: true });
  }

  // -------- HOSTFLIGHT --------
  if (interaction.commandName === 'hostflight') {
    const requiredRole = 'Flight Operations License';
    if (!roles.some(r => r.name === requiredRole)) return interaction.reply({ content: 'Not authorized.', ephemeral: true });

    const flightNumber = interaction.options.getString('flight_number');
    const from = interaction.options.getString('from');
    const to = interaction.options.getString('to');
    const aircraft = interaction.options.getString('aircraft');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const additionalText = interaction.options.getString('additional_text') || '';

    const [hour, minute] = time.split(':').map(Number);
    const dateTime = new Date(`${date}T${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:00Z`);
    const timestamp = Math.floor(dateTime.getTime() / 1000);

    const embed = new EmbedBuilder()
      .setTitle('Upcoming Flights')
      .setColor(0x006C35)
      .addFields({
        name: `Flight ${flightNumber}`,
        value: `Route: ${from} → ${to}\nAircraft: ${aircraft}\nJoin Time: <t:${timestamp}:f>\nHosted By: <@${interaction.user.id}>\n${additionalText}`
      })
      .setDescription('||@everyone||')
      .setImage(UPCOMING_FLIGHT_IMAGE);

    const channel = interaction.guild.channels.cache.find(c => c.name === 'departures');
    if (!channel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });

    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: 'Flight hosted.', ephemeral: true });
  }

  // -------- STATS --------
  if (interaction.commandName === 'stats') {
    const targetUser = interaction.options.getUser('pilot') || interaction.user;
    const userId = targetUser.id;
    const userData = data[userId] || { count: 0, lastFlight: 'Never' };

    const embed = new EmbedBuilder()
      .setTitle(`Flight Stats for ${targetUser.username}`)
      .setColor(0x006C35)
      .addFields(
        { name: 'Total Flights', value: `${userData.count}`, inline: true },
        { name: 'Last Flight', value: userData.lastFlight === 'Never' ? 'Never' : new Date(userData.lastFlight).toLocaleString(), inline: true }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // -------- LEADERBOARD --------
  if (interaction.commandName === 'leaderboard') {
    const sorted = Object.entries(data).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const embed = new EmbedBuilder()
      .setTitle('Flight Leaderboard')
      .setColor(0x006C35);

    let description = '';
    for (let i = 0; i < sorted.length; i++) {
      const userId = sorted[i][0];
      const user = await client.users.fetch(userId);
      description += `#${i + 1} ${user.username} — ${sorted[i][1].count}\n`;
    }
    embed.setDescription(description);
    await interaction.reply({ embeds: [embed], ephemeral: false });
  }
});

// ===== LOGIN =====
client.login(TOKEN);
