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
  ButtonStyle,
  PermissionsBitField
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

// ===== НАСТРОЙКА =====
const CREATE_CHANNEL_ID = "1495412453016600636";

// ===== СЧЕТЧИКИ =====
const adrCounters = { "200": 0, "250": 0, "300": 0 };
const activeRooms = new Map();

// ===== REGISTERED =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) {
    try { await member.roles.add(role); } catch {}
  }
});

// ===== READY =====
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

// ===== STATS =====
client.on('interactionCreate', async (interaction) => {

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'stats') {

      const nickname = interaction.options.getString('nickname');

      try {
        await interaction.deferReply();

        const member = interaction.member;
        const guild = interaction.guild;

        const regRole = guild.roles.cache.find(r => r.name === "REGISTERED");
        if (regRole && member.roles.cache.has(regRole.id)) {
          await member.roles.remove(regRole);
        }

        if (member.manageable) {
          try { await member.setNickname(nickname); } catch {}
        }

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

        const normalRes = await axios.get(
          `${PUBG_API}/players/${playerId}/seasons/${seasonId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
              Accept: 'application/vnd.api+json'
            }
          }
        );

        const stats = normalRes.data.data.attributes.gameModeStats;
        const normal = stats['squad-fpp'] || stats['squad'] || {};

        const fppGames = normal.roundsPlayed || 0;
        const fppAdr = fppGames ? Math.round(normal.damageDealt / fppGames) : 0;
        const fppKd = fppGames ? (normal.kills / fppGames) : 0;

        const embed = new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("📊 PUBG STATS")
          .setDescription(
            `**${nickname}**\n\n` +
            `🎮 Games: ${fppGames}\n` +
            `💥 ADR: ${fppAdr}\n` +
            `🔫 KD: ${fppKd.toFixed(2)}`
          );

        await interaction.editReply({ embeds: [embed] });

      } catch (err) {
        console.log(err);
        await interaction.editReply("❌ Ошибка");
      }
    }
  }

  // ===== КНОПКИ =====
  if (interaction.isButton()) {

    await interaction.deferUpdate().catch(() => {});

    try {

      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) return;

      const data = activeRooms.get(voiceChannel.id);
      if (!data) return;

      // ===== ADR =====
      if (interaction.customId.startsWith("adr_")) {

        let minRole = null;
        let adrKey = null;

        if (interaction.customId === 'adr_200') {
          minRole = "RANKED ADR 200+";
          adrKey = "200";
        }
        if (interaction.customId === 'adr_250') {
          minRole = "RANKED ADR 250+";
          adrKey = "250";
        }
        if (interaction.customId === 'adr_300') {
          minRole = "RANKED ADR 300+";
          adrKey = "300";
        }

        const baseRole = interaction.guild.roles.cache.find(r => r.name === minRole);
        if (!baseRole) return;

        adrCounters[adrKey]++;
        const number = adrCounters[adrKey];

        const allowedRoles = interaction.guild.roles.cache.filter(r =>
          r.name.startsWith("RANKED ADR") && r.position >= baseRole.position
        );

        const perms = [{
          id: interaction.guild.roles.everyone,
          deny: [PermissionsBitField.Flags.Connect]
        }];

        allowedRoles.forEach(r => {
          perms.push({
            id: r.id,
            allow: [PermissionsBitField.Flags.Connect]
          });
        });

        await voiceChannel.permissionOverwrites.set(perms);

        setTimeout(async () => {
          await voiceChannel.setName(`ADR RANKED ${adrKey}+ #${number}`).catch(() => {});
        }, 500);

        try {
          await interaction.channel.send(`🔥 ADR комнаты установлен: **${adrKey}+**`);
        } catch {}

        return interaction.editReply({
          content: `✅ ADR установлен: ${adrKey}+`
        });
      }

      // ===== КИК =====
      if (interaction.customId.startsWith("kick_")) {

        if (interaction.user.id !== data.owner) return;

        const userId = interaction.customId.split("_")[1];
        const member = interaction.guild.members.cache.get(userId);

        if (member && member.voice.channel?.id === voiceChannel.id) {
          await member.voice.disconnect();
        }
      }

    } catch (err) {
      console.log("BUTTON ERROR:", err);
    }
  }
});

// ===== СОЗДАНИЕ КОМНАТ =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {

    if (newState.channelId === CREATE_CHANNEL_ID && oldState.channelId !== CREATE_CHANNEL_ID) {

      const guild = newState.guild;

      const room = await guild.channels.create({
        name: `ADR RANKED (ожидание)`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parentId
      });

      activeRooms.set(room.id, {
        owner: newState.member.id
      });

      await newState.setChannel(room);

      setTimeout(async () => {
        try {
          const fetched = await guild.channels.fetch(room.id);

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('adr_200').setLabel('200+').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('adr_250').setLabel('250+').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('adr_300').setLabel('300+').setStyle(ButtonStyle.Danger)
          );

          await fetched.send({
            content: `🎯 <@${newState.member.id}> выбери порог ADR`,
            components: [row]
          });

        } catch (e) {
          console.log("CHAT ERROR:", e.message);
        }
      }, 1500);
    }

    // ===== УДАЛЕНИЕ =====
    if (oldState.channelId && activeRooms.has(oldState.channelId)) {

      setTimeout(async () => {
        const room = oldState.guild.channels.cache.get(oldState.channelId);
        if (!room) return;

        const humans = room.members.filter(m => !m.user.bot);

        if (humans.size === 0) {
          try {
            await room.delete();
            activeRooms.delete(oldState.channelId);
          } catch {}
        }
      }, 4000);
    }

  } catch (err) {
    console.log("ROOM ERROR:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
