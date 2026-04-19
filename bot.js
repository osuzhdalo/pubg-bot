require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const PUBG_API = "https://api.pubg.com/shards/steam";

// ===== ВХОД =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) {
    try {
      await member.roles.add(role);
    } catch (e) {
      console.log("Ошибка REGISTERED:", e.message);
    }
  }
});

// ===== АВТО КОМНАТЫ =====
let roomCount = 1;

client.on('voiceStateUpdate', async (oldState, newState) => {
  const createChannelName = "СОЗДАТЬ ADR RANKED";

  // ЗАШЕЛ В СОЗДАТЬ
  if (newState.channel && newState.channel.name === createChannelName) {
    const guild = newState.guild;

    const newChannel = await guild.channels.create({
      name: `ADR RANKED #${roomCount++}`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parent
    });

    await newState.setChannel(newChannel);

    // СОЗДАЕМ ТЕКСТОВЫЙ КАНАЛ
    const textChannel = await guild.channels.create({
      name: `adr-${newChannel.name}`,
      type: ChannelType.GuildText,
      parent: newState.channel.parent
    });

    // КНОПКИ
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('adr200')
        .setLabel('200+')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('adr250')
        .setLabel('250+')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('adr300')
        .setLabel('300+')
        .setStyle(ButtonStyle.Danger)
    );

    await textChannel.send({
      content: `⚙️ Настрой доступ в комнату **${newChannel.name}**\nВыбери минимальный ADR:`,
      components: [row]
    });

    newChannel.textId = textChannel.id;
  }

  // УДАЛЕНИЕ ЕСЛИ ПУСТО
  if (oldState.channel && oldState.channel.name.startsWith("ADR RANKED #")) {
    if (oldState.channel.members.size === 0) {
      try {
        const textChannel = oldState.guild.channels.cache.find(c => c.name === `adr-${oldState.channel.name}`);
        if (textChannel) await textChannel.delete();

        await oldState.channel.delete();
      } catch {}
    }
  }
});

// ===== КНОПКИ =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const channel = interaction.member.voice.channel;
  if (!channel) return interaction.reply({ content: "Зайди в голосовой канал!", ephemeral: true });

  let roleName = null;

  if (interaction.customId === "adr200") roleName = "RANKED ADR 200+";
  if (interaction.customId === "adr250") roleName = "RANKED ADR 250+";
  if (interaction.customId === "adr300") roleName = "RANKED ADR 300+";

  const role = interaction.guild.roles.cache.find(r => r.name === roleName);

  if (!role) return interaction.reply({ content: "Роль не найдена", ephemeral: true });

  await channel.permissionOverwrites.edit(role, {
    Connect: true
  });

  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    Connect: false
  });

  await interaction.reply({
    content: `✅ Доступ теперь только для ${roleName}`,
    ephemeral: false
  });
});

// ===== ТВОЯ СТАТИСТИКА (НЕ ТРОГАЛ) =====

function getRankedAdrRole(adr) {
  if (adr >= 350) return "RANKED ADR 350+";
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  if (adr >= 100) return "RANKED ADR 100+";
  return null;
}

function getRankedKdRole(kd) {
  if (kd >= 2) return "RANKED KD 2+";
  if (kd >= 1.5) return "RANKED KD 1.5+";
  if (kd >= 1) return "RANKED KD 1+";
  return null;
}

function getRankRoleName(tier, subTier) {
  if (!tier || !subTier) return null;
  const formatted = tier.charAt(0) + tier.slice(1).toLowerCase();
  return `${formatted} ${subTier}`;
}

client.once('ready', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

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

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    const nickname = interaction.options.getString('nickname');

    try {
      await interaction.deferReply();

      const member = interaction.member;
      const guild = interaction.guild;

      // УБИРАЕМ REGISTERED
      const regRole = guild.roles.cache.find(r => r.name === "REGISTERED");
      if (regRole && member.roles.cache.has(regRole.id)) {
        await member.roles.remove(regRole);
      }

      // НИК
      if (member.manageable) {
        try { await member.setNickname(nickname); } catch {}
      }

      // PUBG API
      const playerRes = await axios.get(
        `${PUBG_API}/players?filter[playerNames]=${nickname}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
            Accept: 'application/vnd.api+json'
          }
        }
      );

      if (!playerRes.data.data.length) {
        return interaction.editReply("❌ Игрок не найден");
      }

      const playerId = playerRes.data.data[0].id;

      const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
        headers: {
          Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
          Accept: 'application/vnd.api+json'
        }
      });

      const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

      const rankedRes = await axios.get(
        `${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
            Accept: 'application/vnd.api+json'
          }
        }
      );

      const ranked = rankedRes.data.data.attributes.rankedGameModeStats['squad'] || {};

      const games = ranked.roundsPlayed || 0;
      const adr = games ? Math.round(ranked.damageDealt / games) : 0;
      const kd = games ? ranked.kills / games : 0;

      const tier = ranked.currentTier?.tier;
      const subTier = ranked.currentTier?.subTier;

      const roles = [];

      async function give(name) {
        const role = guild.roles.cache.find(r => r.name === name);
        if (role) {
          await member.roles.add(role);
          roles.push(name);
        }
      }

      await give(getRankRoleName(tier, subTier));
      await give(getRankedAdrRole(adr));
      await give(getRankedKdRole(kd));

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +
          `🏆 Rank: ${tier} ${subTier}\n` +
          `💥 ADR: ${adr}\n` +
          `🔫 KD: ${kd.toFixed(2)}\n\n` +
          `🟢 Роли: ${roles.join(', ') || 'нет'}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
