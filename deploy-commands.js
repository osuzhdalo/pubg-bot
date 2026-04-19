require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('PUBG статистика')
    .addStringOption(option =>
      option.setName('nickname')
        .setDescription('Ник игрока')
        .setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Начинаю регистрацию команд...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('✅ Slash команды зарегистрированы');
  } catch (error) {
    console.error(error);
  }
})();