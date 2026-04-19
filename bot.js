require('dotenv').config();

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates // 🔥 ВАЖНО
  ]
});
const PUBG_API = "https://api.pubg.com/shards/steam";

// ===== ВХОД (REGISTERED) =====
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

// ===== ADR =====
function getFppAdrRole(adr) {
  if (adr >= 350) return "FPP ADR 350+";
  if (adr >= 300) return "FPP ADR 300+";
  if (adr >= 250) return "FPP ADR 250+";
  if (adr >= 200) return "FPP ADR 200+";
  if (adr >= 100) return "FPP ADR 100+";
  return null;
}

function getRankedAdrRole(adr) {
  if (adr >= 350) return "RANKED ADR 350+";
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  if (adr >= 100) return "RANKED ADR 100+";
  return null;
}

function getRankedDuoAdrRole(adr) {
  if (adr >= 350) return "RANKED DUO ADR 350+";
  if (adr >= 300) return "RANKED DUO ADR 300+";
  if (adr >= 250) return "RANKED DUO ADR 250+";
  if (adr >= 200) return "RANKED DUO ADR 200+";
  if (adr >= 100) return "RANKED DUO ADR 100+";
  return null;
}

// ===== KD =====
function getFppKdRole(kd) {
  if (kd >= 2) return "FPP KD 2+";
  if (kd >= 1.5) return "FPP KD 1.5+";
  if (kd >= 1) return "FPP KD 1+";
  return null;
}

function getRankedKdRole(kd) {
  if (kd >= 2) return "RANKED KD 2+";
  if (kd >= 1.5) return "RANKED KD 1.5+";
  if (kd >= 1) return "RANKED KD 1+";
  return null;
}

function getRankedDuoKdRole(kd) {
  if (kd >= 2) return "RANKED DUO KD 2+";
  if (kd >= 1.5) return "RANKED DUO KD 1.5+";
  if (kd >= 1) return "RANKED DUO KD 1+";
  return null;
}

// ===== RANK =====
function getRankRoleName(tier, subTier) {
  if (!tier || !subTier) return null;
  const formatted = tier.charAt(0) + tier.slice(1).toLowerCase();
  return `${formatted} ${subTier}`;
}

// ===== ВСЕ РОЛИ =====
const ALL_ROLES = [
  "FPP ADR 350+","FPP ADR 300+","FPP ADR 250+","FPP ADR 200+","FPP ADR 100+",
  "RANKED ADR 350+","RANKED ADR 300+","RANKED ADR 250+","RANKED ADR 200+","RANKED ADR 100+",

  "RANKED DUO ADR 350+","RANKED DUO ADR 300+","RANKED DUO ADR 250+","RANKED DUO ADR 200+","RANKED DUO ADR 100+",

  "FPP KD 2+","FPP KD 1.5+","FPP KD 1+",
  "RANKED KD 2+","RANKED KD 1.5+","RANKED KD 1+",

  "RANKED DUO KD 2+","RANKED DUO KD 1.5+","RANKED DUO KD 1+",

  "Bronze 4","Bronze 3","Bronze 2","Bronze 1",
  "Silver 4","Silver 3","Silver 2","Silver 1",
  "Gold 4","Gold 3","Gold 2","Gold 1",
  "Platinum 4","Platinum 3","Platinum 2","Platinum 1",
  "Diamond 4","Diamond 3","Diamond 2","Diamond 1",
  "Master","Grandmaster"
];

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

      // СМЕНА НИКА
      if (member.manageable) {
        try { await member.setNickname(nickname); } catch {}
      }

      // PLAYER
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

      // SEASON
      const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
        headers: {
          Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
          Accept: 'application/vnd.api+json'
        }
      });

      const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

      // NORMAL
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

      // RANKED
      let ranked = {};
      let duo = {};

      let rankedGames = 0, rankedAdr = 0, rankedKd = 0;
      let duoGames = 0, duoAdr = 0, duoKd = 0;

      let tier = "UNRANKED", subTier = "", rp = 0;

      try {
        const rankedRes = await axios.get(
          `${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
              Accept: 'application/vnd.api+json'
            }
          }
        );

        const rankedStats = rankedRes.data.data.attributes.rankedGameModeStats;

        ranked = rankedStats['squad'] || rankedStats['squad-fpp'] || {};
        duo = rankedStats['duo'] || rankedStats['duo-fpp'] || {};

        rankedGames = ranked.roundsPlayed || 0;
        rankedAdr = rankedGames ? Math.round(ranked.damageDealt / rankedGames) : 0;
        rankedKd = rankedGames ? (ranked.kills / rankedGames) : 0;

        duoGames = duo.roundsPlayed || 0;
        duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
        duoKd = duoGames ? (duo.kills / duoGames) : 0;

        rp = ranked.currentRankPoint || 0;
        tier = ranked.currentTier?.tier || "UNRANKED";
        subTier = ranked.currentTier?.subTier || "";

      } catch {}

      // УДАЛЯЕМ СТАРЫЕ РОЛИ
      for (const roleName of ALL_ROLES) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role && member.roles.cache.has(role.id)) {
          if (role.position < guild.members.me.roles.highest.position) {
            await member.roles.remove(role);
          }
        }
      }

      const givenRoles = [];

      async function give(roleName) {
        if (!roleName) return;
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role && role.position < guild.members.me.roles.highest.position) {
          await member.roles.add(role);
          givenRoles.push(role.name);
        }
      }

      // ВЫДАЧА
      await give(getRankRoleName(tier, subTier));
      await give(getFppAdrRole(fppAdr));
      await give(getRankedAdrRole(rankedAdr));
      await give(getRankedDuoAdrRole(duoAdr));
      await give(getFppKdRole(fppKd));
      await give(getRankedKdRole(rankedKd));
      await give(getRankedDuoKdRole(duoKd));

      // EMBED
      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +

          `🔵 NORMAL SQUAD\n` +
          `🎮 Games: ${fppGames}\n` +
          `💥 ADR: ${fppAdr}\n` +
          `🔫 KD: ${fppKd.toFixed(2)}\n\n` +

          `🏆 RANKED SQUAD\n` +
          `🎖 Rank: ${tier} ${subTier}\n` +
          `💠 RP: ${rp}\n` +
          `🎮 Games: ${rankedGames}\n` +
          `💥 ADR: ${rankedAdr}\n` +
          `🔫 KD: ${rankedKd.toFixed(2)}\n\n` +

          `👥 RANKED DUO\n` +
          `🎮 Games: ${duoGames}\n` +
          `💥 ADR: ${duoAdr}\n` +
          `🔫 KD: ${duoKd.toFixed(2)}\n\n` +

          `🟢 Роли: ${givenRoles.length ? givenRoles.join(', ') : 'нет'}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});
const {
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');

const CREATE_CHANNEL_ID = "1495412453016600636";

const adrCounters = { "200": 0, "250": 0, "300": 0 };
const activeRooms = new Map();

// ===== СОЗДАНИЕ =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {

    if (newState.channelId === CREATE_CHANNEL_ID) {

      const guild = newState.guild;

      const room = await guild.channels.create({
        name: `ADR RANKED (ожидание)`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parentId
      });

      activeRooms.set(room.id, {
        owner: newState.member.id,
        adr: null
      });

      await newState.setChannel(room);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('adr_200').setLabel('200+').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('adr_250').setLabel('250+').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('adr_300').setLabel('300+').setStyle(ButtonStyle.Danger)
      );

      await room.send({
        content: `🎯 <@${newState.member.id}> выбери порог ADR`,
        components: [row]
      });
    }

    // ===== УДАЛЕНИЕ =====
    if (oldState.channelId && activeRooms.has(oldState.channelId)) {

      setTimeout(async () => {
        const room = oldState.guild.channels.cache.get(oldState.channelId);
        if (!room) return;

        // 🔥 ЖЕСТКАЯ ПРОВЕРКА
        if (room.members.filter(m => !m.user.bot).size === 0) {
          activeRooms.delete(oldState.channelId);
          await room.delete().catch(() => {});
          console.log("Удалена комната:", oldState.channelId);
        }
      }, 2000);
    }

  } catch (err) {
    console.log("ROOM ERROR:", err);
  }
});

// ===== КНОПКИ =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {

    // 🔥 НАХОДИМ КОМНАТУ ПО ТЕКУЩЕМУ ВОЙСУ
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.deferUpdate();

    const data = activeRooms.get(voiceChannel.id);
    if (!data) return interaction.deferUpdate();

    // ===== КНОПКА КИК =====
    if (interaction.customId.startsWith("kick_")) {
      if (interaction.user.id !== data.owner) {
        return interaction.reply({ content: "❌ Только владелец может кикать", ephemeral: true });
      }

      const userId = interaction.customId.split("_")[1];
      const member = interaction.guild.members.cache.get(userId);

      if (member && member.voice.channel?.id === voiceChannel.id) {
        await member.voice.disconnect();
      }

      return interaction.deferUpdate();
    }

    // ===== ВЫБОР ADR =====
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

    if (!adrKey) return interaction.deferUpdate();

    const baseRole = interaction.guild.roles.cache.find(r => r.name === minRole);
    if (!baseRole) {
      return interaction.reply({ content: "❌ Нет роли", ephemeral: true });
    }

    adrCounters[adrKey]++;
    const number = adrCounters[adrKey];

    const allowedRoles = interaction.guild.roles.cache.filter(r =>
      r.name.startsWith("RANKED ADR") && r.position >= baseRole.position
    );

    const perms = [
      {
        id: interaction.guild.roles.everyone,
        deny: [PermissionsBitField.Flags.Connect]
      }
    ];

    allowedRoles.forEach(r => {
      perms.push({
        id: r.id,
        allow: [PermissionsBitField.Flags.Connect]
      });
    });

    await voiceChannel.permissionOverwrites.set(perms);

    // 🔥 МЕНЯЕМ ИМЯ
    await voiceChannel.setName(`ADR RANKED ${adrKey}+ #${number}`);

    data.adr = adrKey;

    // 🔥 СОЗДАЕМ КНОПКИ КИКА
    const members = voiceChannel.members.filter(m => !m.user.bot);

    const kickRow = new ActionRowBuilder();

    members.forEach(m => {
      if (m.id !== data.owner) {
        kickRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`kick_${m.id}`)
            .setLabel(`Кик ${m.user.username}`)
            .setStyle(ButtonStyle.Secondary)
        );
      }
    });

    await interaction.update({
      content: `✅ ADR комнаты установлен: ${adrKey}+`,
      components: kickRow.components.length ? [kickRow] : []
    });

  } catch (err) {
    console.log("BUTTON ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => {});
    }
  }
});
client.login(process.env.DISCORD_TOKEN);
