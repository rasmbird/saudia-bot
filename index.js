const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CLIENT_ID = '1138806788708368544';
const TOKEN = process.env.TOKEN;
const DATA_FILE = './flights.json';

const UPCOMING_FLIGHT_IMAGE = 'https://media.discordapp.net/attachments/1487215768188883044/1487246574462435338/Saudia_Upcoming_Flight.png?ex=69c91a8f&is=69c7c90f&hm=93686de71b51add6562458d6fcba6c968dee3cfcfc1395e20242cbf22d5d4e15&=&format=webp&quality=lossless';

// ===== INITIALIZE DATA FILE =====
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
}

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight using event')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Event name (e.g. SV637)')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check total flights logged for a pilot')
    .addUserOption(option =>
      option.setName('pilot')
        .setDescription('Select a pilot')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top pilots by flights logged'),

  new SlashCommandBuilder()
    .setName('hostflight')
    .setDescription('Host an upcoming flight')
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
        .setDescription('Flight Date (YYYY-MM-DD)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Join Time (HH:MM in KSA timezone)')
        .setRequired(true))
].map(cmd => cmd.toJSON());

// ===== REGISTER COMMANDS =====
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
})();

// ===== BOT READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== HELPER: LOAD / SAVE =====
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save flights:', err);
  }
}

// ===== HANDLE INTERACTIONS =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const data = loadData();
    const memberRoles = interaction.member.roles.cache;

    // -------- LOGFLIGHT (UPDATED ONLY) --------
    if (interaction.commandName === 'logflight') {
      const allowedRoles = ['CP | Captain', 'FO | First Officer'];
      const hasPermission = memberRoles.some(role => allowedRoles.includes(role.name));

      if (!hasPermission) {
        return interaction.reply({ content: 'You are not authorized to log flights.', ephemeral: true });
      }

      const eventName = interaction.options.getString('event');

      const logChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs');
      if (!logChannel) return interaction.reply({ content: 'Flight log channel not found.', ephemeral: true });

      const userId = interaction.user.id;
      if (!data[userId]) data[userId] = { count: 0, lastFlight: null };

      data[userId].count += 1;
      data[userId].lastFlight = new Date().toISOString();
      saveData(data);

      let roleTitle = '';
      if (memberRoles.some(role => role.name === 'CP | Captain')) roleTitle = 'Captain';
      else if (memberRoles.some(role => role.name === 'FO | First Officer')) roleTitle = 'First Officer';

      const embed = new EmbedBuilder()
        .setTitle('Flight Log')
        .setColor(0x006C35)
        .addFields(
          { name: roleTitle, value: `<@${interaction.user.id}>`, inline: false },
          { name: 'Event', value: eventName, inline: true },
          { name: 'Total Flights', value: `${data[userId].count}`, inline: true }
        )
        .setFooter({ text: `Time: ${new Date().toLocaleString()}` });

      logChannel.send({ embeds: [embed] });
      await interaction.reply({ content: 'Flight logged successfully.', ephemeral: true });
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
          {
            name: 'Last Flight',
            value: userData.lastFlight === 'Never'
              ? 'Never'
              : new Date(userData.lastFlight).toLocaleString(),
            inline: true
          }
        );

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // -------- LEADERBOARD --------
    if (interaction.commandName === 'leaderboard') {
      const leaderboard = Object.entries(data)
        .map(([id, info]) => ({ id, count: info.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      if (leaderboard.length === 0) {
        return interaction.reply({ content: 'No flights logged yet.', ephemeral: true });
      }

      const fields = leaderboard.map((pilot, index) => {
        const member = interaction.guild.members.cache.get(pilot.id);

        let name = 'Unknown User';
        if (member) {
          name = member.displayName;
        }

        return {
          name: `#${index + 1} ${name}`,
          value: `Flights: ${pilot.count}`,
          inline: false
        };
      });

      const embed = new EmbedBuilder()
        .setTitle('Top Pilots Leaderboard')
        .setColor(0x006C35)
        .addFields(fields)
        .setFooter({ text: `Updated: ${new Date().toLocaleString()}` });

      await interaction.reply({ embeds: [embed] });
    }

    // -------- HOSTFLIGHT --------
    if (interaction.commandName === 'hostflight') {
      const requiredRole = 'Flight Operations License';
      const hasPermission = memberRoles.some(role => role.name === requiredRole);

      if (!hasPermission) {
        return interaction.reply({ content: 'You need the Flight Operations License role to host flights.', ephemeral: true });
      }

      const flightNumber = interaction.options.getString('flight_number');
      const from = interaction.options.getString('from');
      const to = interaction.options.getString('to');
      const aircraft = interaction.options.getString('aircraft');
      const dateInput = interaction.options.getString('date');
      const timeInput = interaction.options.getString('time');

      const [hour, minute] = timeInput.split(':').map(Number);
      const dateTime = new Date(`${dateInput}T${(hour - 3).toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:00Z`);
      const timestamp = Math.floor(dateTime.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setTitle('Upcoming Flights')
        .setColor(0x006C35)
        .setImage(UPCOMING_FLIGHT_IMAGE)
        .addFields(
          {
            name: `Flight Number: ${flightNumber}`,
            value: `Route: ${from} → ${to}\nAircraft: ${aircraft}\nJoin Time: <t:${timestamp}:f>\nHosted By: <@${interaction.user.id}>`,
            inline: false
          },
          {
            name: '\u200B',
            value: '@here',
            inline: false
          }
        );

      const hostChannel = interaction.guild.channels.cache.find(c => c.name === 'departures');
      if (!hostChannel) return interaction.reply({ content: 'Departures channel not found.', ephemeral: true });

      hostChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      await interaction.reply({ content: 'Flight hosted successfully!', ephemeral: true });
    }

  } catch (err) {
    console.error('Error:', err);
    if (!interaction.replied) {
      interaction.reply({ content: 'Something went wrong.', ephemeral: true });
    }
  }
});

client.login(TOKEN);
