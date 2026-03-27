const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;

  // Ping command
  if (message.content === '!ping') {
    message.reply('Bot is online.');
  }

  // Flight log command
  if (message.content.startsWith('!logflight')) {
    const args = message.content.split(' ').slice(1);

    if (args.length < 3) {
      return message.reply('Usage: !logflight <FlightNumber> <From> <To>');
    }

    const flightNumber = args[0];
    const from = args[1];
    const to = args[2];

    // Find flight-logs channel
    const logChannel = message.guild.channels.cache.find(
      channel => channel.name === 'flight-logs'
    );

    if (!logChannel) {
      return message.reply('Flight log channel not found.');
    }

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle('Flight Log')
      .addFields(
        { name: 'Pilot', value: `${message.author}`, inline: false },
        { name: 'Flight Number', value: flightNumber, inline: true },
        { name: 'Route', value: `${from} → ${to}`, inline: true }
      )
      .setFooter({ text: `Time: ${new Date().toLocaleString()}` });

    logChannel.send({ embeds: [embed] });

    message.reply('Flight logged successfully.');
  }
});

client.login(process.env.TOKEN);
