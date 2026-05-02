require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
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

// ===== ADR FPP =====
function getFppAdrRole(adr) {
  if (adr >= 350) return "FPP ADR 350+";
  if (adr >= 300) return "FPP ADR 300+";
  if (adr >= 250) return "FPP ADR 250+";
  if (adr >= 200) return "FPP ADR 200+";
  if (adr >= 150) return "FPP ADR 150+";
  return "FPP ADR 100+";
}

// ===== ADR TPP (ДОБАВЛЕНО) =====
function getTppAdrRole(adr) {
  if (adr >= 350) return "TPP ADR 350+";
  if (adr >= 300) return "TPP ADR 300+";
  if (adr >= 250) return "TPP ADR 250+";
  if (adr >= 200) return "TPP ADR 200+";
  if (adr >= 150) return "TPP ADR 150+";
  return "TPP ADR 100+";
}

// ===== KD FPP =====
function getFppKdRole(kd) {
  if (kd >= 2) return "FPP KD 2+";
  if (kd >= 1.5) return "FPP KD 1.5+";
  if (kd >= 1) return "FPP KD 1+";
  return null;
}

// ===== KD TPP =====
function getTppKdRole(kd) {
  if (kd >= 2) return "TPP KD 2+";
  if (kd >= 1.5) return "TPP KD 1.5+";
  if (kd >= 1) return "TPP KD 1+";
  return null;
}

// ===== RANKED (без изменений) =====
function getRankedAdrRole(adr) {
  if (adr >= 350) return "RANKED ADR 350+";
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  if (adr >= 150) return "RANKED ADR 150+";
  return "RANKED ADR 100+";
}

function getRankedDuoAdrRole(adr) {
  if (adr >= 350) return "RANKED DUO ADR 350+";
  if (adr >= 300) return "RANKED DUO ADR 300+";
  if (adr >= 250) return "RANKED DUO ADR 250+";
  if (adr >= 200) return "RANKED DUO ADR 200+";
  if (adr >= 150) return "RANKED DUO ADR 150+";
  return "RANKED DUO ADR 100+";
}

// ===== KD RANKED =====
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

// ===== РОЛИ (ДОБАВЛЕН TPP) =====
const ALL_ROLES = [
  "FPP ADR 350+","FPP ADR 300+","FPP ADR 250+","FPP ADR 200+","FPP ADR 100+",
  "TPP ADR 350+","TPP ADR 300+","TPP ADR 250+","TPP ADR 200+","TPP ADR 100+",

  "RANKED ADR 350+","RANKED ADR 300+","RANKED ADR 250+","RANKED ADR 200+","RANKED ADR 150+","RANKED ADR 100+",

  "RANKED DUO ADR 350+","RANKED DUO ADR 300+","RANKED DUO ADR 250+","RANKED DUO ADR 200+","RANKED DUO ADR 100+",

  "FPP KD 2+","FPP KD 1.5+","FPP KD 1+",
  "TPP KD 2+","TPP KD 1.5+","TPP KD 1+",

  "RANKED KD 2+","RANKED KD 1.5+","RANKED KD 1+",
  "RANKED DUO KD 2+","RANKED DUO KD 1.5+","RANKED DUO KD 1+"
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

      // 🔥 ВАЖНО: РАЗДЕЛЕНИЕ
      const fpp = stats['squad-fpp'] || {};
      const tpp = stats['squad'] || {};

      const fppGames = fpp.roundsPlayed || 0;
      const fppAdr = fppGames ? Math.round(fpp.damageDealt / fppGames) : 0;
      const fppKd = fppGames ? (fpp.kills / fppGames) : 0;

      const tppGames = tpp.roundsPlayed || 0;
      const tppAdr = tppGames ? Math.round(tpp.damageDealt / tppGames) : 0;
      const tppKd = tppGames ? (tpp.kills / tppGames) : 0;

      let givenRoles = [];

      async function give(roleName) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role && role.position < guild.members.me.roles.highest.position) {
          await member.roles.add(role);
          givenRoles.push(role.name);
        }
      }

      for (const roleName of ALL_ROLES) {
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
        }
      }

      // ===== ВЫДАЧА =====
      await give(getFppAdrRole(fppAdr));
      await give(getTppAdrRole(tppAdr));

      await give(getFppKdRole(fppKd));
      await give(getTppKdRole(tppKd));

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +
          `🔵 FPP\nGames: ${fppGames}\nADR: ${fppAdr}\nKD: ${fppKd.toFixed(2)}\n\n` +
          `🟡 TPP\nGames: ${tppGames}\nADR: ${tppAdr}\nKD: ${tppKd.toFixed(2)}\n\n` +
          `🟢 Роли: ${givenRoles.join(', ') || 'нет'}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});
const CREATE_CHANNELS = {
  "150": "1495532168946913310",
  "200": "1495532213674971147",
  "250": "1495532256410734824",
  "300": "1495532283354943508"
};

const counters = { 150: 0, 200: 0, 250: 0, 300: 0 };
const activeRooms = new Set();

const ADR_ROLES = {
  "150": "1495382626146717726",
  "200": "1495382551731110008",
  "250": "1495382501244403803",
  "300": "1495380338069999738",
  "350": "1495380397524123820"
};

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guild = newState.guild;
    const member = newState.member;

    // ===== СОЗДАНИЕ =====
    for (const adr in CREATE_CHANNELS) {
      if (
        newState.channelId === CREATE_CHANNELS[adr] &&
        oldState.channelId !== CREATE_CHANNELS[adr]
      ) {
        counters[adr]++;
        const number = counters[adr];

        const room = await guild.channels.create({
          name: `🎯 ADR RANKED ${adr}+ #${number}`,
          type: ChannelType.GuildVoice,
          parent: newState.channel.parentId,
          userLimit: 4
        });

        activeRooms.add(room.id);

        await member.voice.setChannel(room);
      }
    }

    // ===== ФИЛЬТР (НОРМАЛЬНЫЙ) =====
    if (newState.channelId && activeRooms.has(newState.channelId)) {
      const channel = newState.channel;
      const match = channel.name.match(/ADR RANKED (\d+)\+/);

      if (match) {
        const requiredAdr = parseInt(match[1]);

        const hasAccess = Object.keys(ADR_ROLES).some(adr => {
          return (
            parseInt(adr) >= requiredAdr &&
            member.roles.cache.has(ADR_ROLES[adr])
          );
        });

        if (!hasAccess) {
          // мягкий кик (почти незаметно)
          setTimeout(() => {
            member.voice.setChannel(null).catch(() => {});
          }, 300);
        }
      }
    }

    // ===== УДАЛЕНИЕ (ТВОЙ СТАРЫЙ ВАРИАНТ — ОН РАБОЧИЙ) =====
    if (oldState.channelId && activeRooms.has(oldState.channelId)) {
      setTimeout(async () => {
        const ch = oldState.guild.channels.cache.get(oldState.channelId);
        if (!ch) return;

        if (ch.members.size === 0) {
          activeRooms.delete(ch.id);
          await ch.delete().catch(() => {});
        }
      }, 1500);
    }

  } catch (err) {
    console.log("VOICE ERROR:", err);
  }
});
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");

  if (role) {
    try {
      await member.roles.add(role);
    } catch {}
  }

  try {
    await member.send(
      "👋 Привіт!\n\n" +
      "Ласкаво просимо на сервер 🎮\n\n" +
      "🎮 Хочеш грати в PUBG:\n" +
      "Напиши в каналі #реєстрація:\n" +
      "👉 /stats твій_нік\n" +
      "👉 Приклад: /stats osuzhdalo\n\n" +
      "💬 Хочеш просто спілкуватися:\n" +
      "Можеш одразу писати в чатах\n\n" +
      "⚠️ Без /stats немає доступу до ігрових кімнат"
    );
  } catch {
    console.log("Не вдалося надіслати ЛС");
  }
}); // ← ВОТ ЭТА СКОБКА ОЧЕНЬ ВАЖНА
client.login(process.env.DISCORD_TOKEN);
