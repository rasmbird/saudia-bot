const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const CLIENT_ID = '1138806788708368544';
const TOKEN = process.env.TOKEN;
const DATA_FILE = './flights.json';

const UPCOMING_FLIGHT_IMAGE = 'https://media.discordapp.net/attachments/1487215768188883044/1487246574462435338/Saudia_Upcoming_Flight.png?ex=69c91a8f&is=69c7c90f&hm=93686de71b51add6562458d6fcba6c968dee3cfcfc1395e20242cbf22d5d4e15&=&format=webp&quality=lossless';

// ===== INIT FILE =====
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
}

// ===== COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight')
    .addStringOption(option =>
      option.setName('flight').setDescription('Flight Number').setRequired(true))
    .addStringOption(option =>
      option.setName('from').setDescription('Departure').setRequired(true))
    .addStringOption(option =>
      option.setName('to').setDescription('Arrival').setRequired(true)),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Check stats')
    .addUserOption(option =>
      option.setName('pilot').setDescription('Pilot')),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top pilots'),

  new SlashCommandBuilder()
    .setName('hostflight')
    .setDescription('Host flight')
    .addStringOption(o => o.setName('flight_number').setRequired(true))
    .addStringOption(o => o.setName('from').setRequired(true))
    .addStringOption(o => o.setName('to').setRequired(true))
    .addStringOption(o => o.setName('aircraft').setRequired(true))
    .addStringOption(o => o.setName('date').setRequired(true))
    .addStringOption(o => o.setName('time').setRequired(true))
].map(cmd => cmd.toJSON());

// ===== REGISTER =====
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
})();

// ===== READY =====
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== DATA =====
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== MAIN =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const data = loadData();
    const roles = interaction.member.roles.cache;

    // ===== LOGFLIGHT =====
    if (interaction.commandName === 'logflight') {
      const allowed = ['CP | Captain', 'FO | First Officer'];
      if (!roles.some(r => allowed.includes(r.name))) {
        return interaction.reply({ content: 'Not authorized.', ephemeral: true });
      }

      const flight = interaction.options.getString('flight');
      const from = interaction.options.getString('from');
      const to = interaction.options.getString('to');

      const channel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs');
      if (!channel) return interaction.reply({ content: 'Channel missing.', ephemeral: true });

      const id = interaction.user.id;
      if (!data[id]) data[id] = { count: 0, lastFlight: null };

      data[id].count++;
      data[id].lastFlight = new Date().toISOString();
      saveData(data);

      const roleName = roles.some(r => r.name === 'CP | Captain') ? 'Captain' : 'First Officer';

      const embed = new EmbedBuilder()
        .setTitle('Flight Log')
        .setColor(0x006C35)
        .addFields(
          { name: roleName, value: `<@${id}>` },
          { name: 'Flight', value: flight, inline: true },
          { name: 'Route', value: `${from} → ${to}`, inline: true },
          { name: 'Total', value: `${data[id].count}`, inline: true }
        )
        .setFooter({ text: `Time: ${new Date().toLocaleString()}` });

      channel.send({ embeds: [embed] });
      return interaction.reply({ content: 'Logged.', ephemeral: true });
    }

    // ===== HOSTFLIGHT =====
    if (interaction.commandName === 'hostflight') {
      if (!roles.some(r => r.name === 'Flight Operations License')) {
        return interaction.reply({ content: 'No permission.', ephemeral: true });
      }

      const flight = interaction.options.getString('flight_number');
      const from = interaction.options.getString('from');
      const to = interaction.options.getString('to');
      const aircraft = interaction.options.getString('aircraft');
      const date = interaction.options.getString('date');
      const time = interaction.options.getString('time');

      const [h, m] = time.split(':').map(Number);
      const utc = new Date(`${date}T${(h - 3).toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00Z`);
      const ts = Math.floor(utc.getTime() / 1000);

      const embed = new EmbedBuilder()
        .setTitle('Upcoming Flights')
        .setColor(0x006C35)
        .setImage(UPCOMING_FLIGHT_IMAGE)
        .addFields(
          {
            name: `Flight Number: ${flight}`,
            value: `Route: ${from} → ${to}\nAircraft: ${aircraft}\nJoin Time: <t:${ts}:f>\nHosted By: <@${interaction.user.id}>`
          },
          { name: '\u200B', value: '@here' }
        );

      const channel = interaction.guild.channels.cache.find(c => c.name === 'departures');
      if (!channel) return interaction.reply({ content: 'Departures missing.', ephemeral: true });

      channel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
      });

      return interaction.reply({ content: 'Flight hosted.', ephemeral: true });
    }

    // ===== STATS =====
    if (interaction.commandName === 'stats') {
      const user = interaction.options.getUser('pilot') || interaction.user;
      const d = data[user.id] || { count: 0, lastFlight: 'Never' };

      const embed = new EmbedBuilder()
        .setTitle(`Stats: ${user.username}`)
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

    // ===== LEADERBOARD (UPDATED) =====
    if (interaction.commandName === 'leaderboard') {
      const sorted = Object.entries(data)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

      const fields = sorted.map((u, i) => {
        const member = interaction.guild.members.cache.get(u[0]);
        const name = member ? member.displayName : 'Unknown User';

        return {
          name: `#${i + 1} ${name}`,
          value: `Flights: ${u[1].count}`
        };
      });

      const embed = new EmbedBuilder()
        .setTitle('Leaderboard')
        .setColor(0x006C35)
        .addFields(fields);

      return interaction.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      interaction.reply({ content: 'Error.', ephemeral: true });
    }
  }
});

client.login(TOKEN);
