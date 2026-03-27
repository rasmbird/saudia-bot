const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== REGISTER SLASH COMMAND =====
const commands = [
  new SlashCommandBuilder()
    .setName('logflight')
    .setDescription('Log a flight')
    .addStringOption(option =>
      option.setName('flight')
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
].map(cmd => cmd.toJSON());

// ===== REGISTER TO DISCORD =====
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');

    await rest.put(
      Routes.applicationCommands('1138806788708368544'), // replace this
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

// ===== HANDLE SLASH COMMAND =====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'logflight') {

    const flightNumber = interaction.options.getString('flight');
    const from = interaction.options.getString('from');
    const to = interaction.options.getString('to');

    const logChannel = interaction.guild.channels.cache.find(
      channel => channel.name === 'flight-logs'
    );

    if (!logChannel) {
      return interaction.reply({ content: 'Flight log channel not found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Flight Log')
      .setColor(0x006C35)
      .addFields(
        { name: 'Pilot', value: `${interaction.user}`, inline: false },
        { name: 'Flight Number', value: flightNumber, inline: true },
        { name: 'Route', value: `${from} → ${to}`, inline: true }
      )
      .setFooter({ text: `Time: ${new Date().toLocaleString()}` });

    logChannel.send({ embeds: [embed] });

    await interaction.reply({ content: 'Flight logged successfully.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
