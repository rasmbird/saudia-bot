const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

// ===== SENDMESSAGE COOLDOWN =====
const SENDMESSAGE_COOLDOWN_MS = 60_000;
const sendMessageCooldowns = new Map(); // userId -> lastUsedMs

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
    .setDescription('Check flight stats (yours or someone else)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check (optional)')
        .setRequired(false)
    ),

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
    .addStringOption(o =>
      o.setName('additional_text')
        .setDescription('Optional additional text for the flight hostess')
        .setRequired(false))
    .addStringOption(o =>
      o.setName('image_url')
        .setDescription('Optional image URL for the embed')
        .setRequired(false)),

  // ===== SENDMESSAGE COMMAND =====
  new SlashCommandBuilder()
    .setName('sendmessage')
    .setDescription('Send an embedded message to a chosen channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send the embed')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Title of the embed')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('description')
        .setDescription('Description of the embed')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('image_url')
        .setDescription('Optional image URL for the embed')
        .setRequired(false)),

  // ===== CANCELLOG COMMAND =====
  new SlashCommandBuilder()
    .setName('cancellog')
    .setDescription('Cancel/remove an approved flight log for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to manage')
        .setRequired(true)
    )
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

function ensureUserData(data, userId) {
  if (!data[userId]) data[userId] = { count: 0, lastFlight: null };
  if (!Array.isArray(data[userId].logs)) data[userId].logs = [];
  return data[userId];
}

// ===== MAIN =====
client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {
    const data = loadData();
    const roles = interaction.member.roles.cache;

    // ===== LOGFLIGHT (REQUEST) =====
    if (interaction.commandName === 'logflight') {
      const allowedRoles = ['P | Pilot', 'FO | First Officer'];
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
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const d = data[targetUser.id] || { count: 0, lastFlight: 'Never' };

      const embed = new EmbedBuilder()
        .setTitle(`Stats: ${targetUser.username}`)
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
      const additionalText = interaction.options.getString('additional_text') || '';
      const imageUrl = interaction.options.getString('image_url') || UPCOMING_FLIGHT_IMAGE;

      const [hour, minute] = time.split(':').map(Number);
      const dateTime = new Date(`${date}T${(hour - 3).toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}:00Z`);
      const timestamp = Math.floor(dateTime.getTime() / 1000);

      let valueText = `Route: ${from} → ${to}\nAircraft: ${aircraft}\nJoin Time: <t:${timestamp}:f>\nHosted By: <@${interaction.user.id}>`;
      if (additionalText) valueText += `\n${additionalText}`;

      const embed = new EmbedBuilder()
        .setTitle('Upcoming Flights')
        .setColor(0x006C35)
        .setImage(imageUrl)
        .addFields({ name: `Flight ${flightNumber}`, value: valueText });

      const channel = interaction.guild.channels.cache.find(c => c.name === 'departures');
      if (!channel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });

      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: 'Flight hosted.', ephemeral: true });
    }

    // ===== SENDMESSAGE =====
    if (interaction.commandName === 'sendmessage') {
      if (!roles.some(r => APPROVER_ROLES.includes(r.name))) {
        return interaction.reply({ content: 'Not authorized.', ephemeral: true });
      }

      const isFounder = roles.some(r => r.name === 'F | Founder');

      if (!isFounder) {
        const now = Date.now();
        const lastUsed = sendMessageCooldowns.get(interaction.user.id) || 0;
        const remaining = SENDMESSAGE_COOLDOWN_MS - (now - lastUsed);

        if (remaining > 0) {
          return interaction.reply({
            content: `Please wait ${Math.ceil(remaining / 1000)}s before using \`/sendmessage\` again.`,
            ephemeral: true
          });
        }

        sendMessageCooldowns.set(interaction.user.id, now);
      }

      const channel = interaction.options.getChannel('channel');
      const title = interaction.options.getString('title') || '';
      const description = interaction.options.getString('description') || '';
      const imageUrl = interaction.options.getString('image_url') || '';

      if (!channel.isTextBased()) {
        return interaction.reply({ content: 'Selected channel is not text-based.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x006C35)
        .setDescription(description || null)
        // clickable mention, placed as the last field (bottom)
        .addFields({ name: 'Sent by', value: `<@${interaction.user.id}>`, inline: false });

      if (imageUrl) embed.setImage(imageUrl);

      await channel.send({ embeds: [embed] });

      return interaction.reply({ content: 'Message sent.', ephemeral: true });
    }

    // ===== CANCELLOG =====
    if (interaction.commandName === 'cancellog') {
      if (!roles.some(r => APPROVER_ROLES.includes(r.name))) {
        return interaction.reply({ content: 'Not authorized.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('user');
      const userData = ensureUserData(data, targetUser.id);

      const logs = Array.isArray(userData.logs) ? userData.logs : [];
      if (logs.length === 0) {
        return interaction.reply({ content: 'That user has no saved flight logs.', ephemeral: true });
      }

      const maxButtons = 25;
      const shownLogs = logs.slice(-maxButtons).reverse(); // newest first, up to 25

      const lines = shownLogs.map((l, idx) => {
        const n = idx + 1;
        const ts = l.createdAt ? Math.floor(new Date(l.createdAt).getTime() / 1000) : null;
        const when = ts ? `<t:${ts}:f>` : 'Unknown date';
        const ev = l.event || 'Unknown event';
        return `**${n}.** ${ev} — ${when}`;
      });

      const embed = new EmbedBuilder()
        .setTitle(`Cancel Flight Log: ${targetUser.username}`)
        .setColor(0xFF0000)
        .setDescription(lines.join('\n'));

      if (logs.length > maxButtons) {
        embed.addFields({
          name: 'Note',
          value: `Showing newest ${maxButtons} logs only (you have ${logs.length}).` 
        });
      }

      const buttons = shownLogs.map((_, idx) =>
        new ButtonBuilder()
          .setCustomId(`cancellog_${targetUser.id}_${idx}`)
          .setLabel(`${idx + 1}`)
          .setStyle(ButtonStyle.Danger)
      );

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
  }

  // ===== BUTTONS =====
  if (interaction.isButton()) {
    const roles = interaction.member.roles.cache;

    if (!roles.some(r => APPROVER_ROLES.includes(r.name))) {
      return interaction.reply({ content: 'Not authorized.', ephemeral: true });
    }

    const data = loadData();

    // ===== CANCELLOG BUTTONS =====
    if (interaction.customId.startsWith('cancellog_')) {
      const [, targetUserId, indexStr] = interaction.customId.split('_');
      const idx = Number(indexStr);

      const targetUserData = ensureUserData(data, targetUserId);

      const maxButtons = 25;
      const shownLogs = targetUserData.logs.slice(-maxButtons).reverse(); // newest first

      if (!Number.isInteger(idx) || idx < 0 || idx >= shownLogs.length) {
        return interaction.reply({ content: 'That log selection is no longer valid.', ephemeral: true });
      }

      // Map shown index back to real index in stored array
      const realIndex = targetUserData.logs.length - 1 - idx;
      const removed = targetUserData.logs.splice(realIndex, 1)[0];

      // Make flights match the remaining logs count (THIS is the 2 -> 1 behavior)
      targetUserData.count = targetUserData.logs.length;

      // Update lastFlight
      if (targetUserData.logs.length === 0) {
        targetUserData.lastFlight = 'Never';
      } else {
        const newest = targetUserData.logs[targetUserData.logs.length - 1];
        targetUserData.lastFlight = newest.createdAt || targetUserData.lastFlight;
      }

      saveData(data);

      const ev = removed?.event || 'Unknown event';

      const embed = new EmbedBuilder()
        .setTitle('Flight Log Cancelled')
        .setColor(0xFF0000)
        .setDescription(`Removed log **${ev}** for <@${targetUserId}>.\nNew total flights: **${targetUserData.count}**`);

      return interaction.update({ embeds: [embed], components: [] });
    }

    const [action, userId, event] = interaction.customId.split('_');

    const logChannel = interaction.guild.channels.cache.find(c => c.name === 'flight-logs');

    if (action === 'approve') {
      const userData = ensureUserData(data, userId);

      userData.count++;
      userData.lastFlight = new Date().toISOString();
      userData.logs.push({ event, createdAt: userData.lastFlight });

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
          { name: 'Total Flights', value: `${userData.count}` }
        );

      if (logChannel) await logChannel.send({ embeds: [logEmbed] });

      return interaction.update({ embeds: [approvedEmbed], components: [] });
    }

    if (action === 'deny') {
      const modal = new ModalBuilder()
        .setCustomId(`denyreason_${userId}_${event}`)
        .setTitle('Deny Flight Log Request');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for denial')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }
  }

  // ===== DENY REASON MODAL =====
  if (interaction.isModalSubmit()) {
    const roles = interaction.member.roles.cache;

    if (!roles.some(r => APPROVER_ROLES.includes(r.name))) {
      return interaction.reply({ content: 'Not authorized.', ephemeral: true });
    }

    if (!interaction.customId.startsWith('denyreason_')) return;

    const [, userId, event] = interaction.customId.split('_');
    const reason = interaction.fields.getTextInputValue('reason');

    const deniedEmbed = new EmbedBuilder()
      .setTitle('Flight Denied')
      .setColor(0xFF0000)
      .setDescription(`Sorry <@${userId}>, your request has been denied.`)
      .addFields(
        { name: 'Event', value: event },
        { name: 'Denied By', value: `<@${interaction.user.id}>` },
        { name: 'Reason', value: reason }
      );

    return interaction.update({ embeds: [deniedEmbed], components: [] });
  }
});

client.login(TOKEN);
