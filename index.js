const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', message => {
  if (message.author.bot) return;

  // Ping command
  if (message.content === '!ping') {
    message.reply('Pong 🟢');
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

    message.channel.send(`
✈️ **Flight Logged**
👨‍✈️ Pilot: ${message.author}
🔢 Flight: ${flightNumber}
📍 Route: ${from} → ${to}
🕒 Time: ${new Date().toLocaleString()}
    `);
  }
});

client.login(process.env.TOKEN);
