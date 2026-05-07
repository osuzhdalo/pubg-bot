require('dotenv').config();
const fs = require('fs');
const { createCanvas } = require('canvas');
const MATCH_DB = "./match_db.json";

function loadDB() {
  if (!fs.existsSync(MATCH_DB)) return {};
  return JSON.parse(fs.readFileSync(MATCH_DB));
}

function saveDB(data) {
  fs.writeFileSync(MATCH_DB, JSON.stringify(data, null, 2));
}

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
const MATCH_CHANNEL_ID = "1502042041994182816";
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
  if (adr >= 150) return "FPP ADR 150+";
  return "FPP ADR 100+";
}

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
// ===== TPP ADR =====
function getTppAdrRole(adr) {
  if (adr >= 350) return "TPP ADR 350+";
  if (adr >= 300) return "TPP ADR 300+";
  if (adr >= 250) return "TPP ADR 250+";
  if (adr >= 200) return "TPP ADR 200+";
  if (adr >= 150) return "TPP ADR 150+";
  return "TPP ADR 100+";
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
  "RANKED ADR 350+","RANKED ADR 300+","RANKED ADR 250+","RANKED ADR 200+","RANKED ADR 150+","RANKED ADR 100+",
  "TPP ADR 350+","TPP ADR 300+","TPP ADR 250+","TPP ADR 200+","TPP ADR 150+","TPP ADR 100+",

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

async function createMatchCard(data, type) {
  const canvas = createCanvas(1200, 600);
  const ctx = canvas.getContext('2d');

  // фон
  ctx.fillStyle = type === "win" ? "#0d0d0d" : "#120018";
  ctx.fillRect(0, 0, 1200, 600);

  // заголовок
  ctx.fillStyle = type === "win" ? "#FFD700" : "#B026FF";
  ctx.font = "bold 40px Arial";

  const title =
    type === "win"
      ? "WINNER WINNER CHICKEN DINNER"
      : "NEW KILL RECORD";

  ctx.fillText(title, 50, 80);

  // ник
  ctx.fillStyle = "#fff";
  ctx.font = "30px Arial";
  ctx.fillText(`Player: ${data.name}`, 50, 180);

  ctx.fillText(`Kills: ${data.kills}`, 50, 240);
  ctx.fillText(`Assists: ${data.assists}`, 50, 300);
  ctx.fillText(`Damage: ${data.damage}`, 50, 360);

  ctx.fillText(`Rank: ${data.rank}`, 50, 420);

  return canvas.toBuffer();
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

      // СМЕНА НИКА
      if (member.manageable) {
        try { await member.setNickname(nickname); } catch {}
      }

      // PLAYER
     const playerRes = await axios.get(
  `${PUBG_API}/players?filter[playerNames]=${player}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
      Accept: "application/vnd.api+json"
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
      const normalFpp = stats['squad-fpp'] || {};
const normalTpp = stats['squad'] || {};

      const fppGames = normalFpp.roundsPlayed || 0;
const fppAdr = fppGames ? Math.round(normalFpp.damageDealt / fppGames) : 0;
const fppKd = fppGames ? (normalFpp.kills / fppGames) : 0;

const tppGames = normalTpp.roundsPlayed || 0;
const tppAdr = tppGames ? Math.round(normalTpp.damageDealt / tppGames) : 0;

      // RANKED
      let ranked = {};
      let duo = {};

      let rankedGames = 0, rankedAdr = 0, rankedKd = 0;
let duoGames = 0, duoAdr = 0, duoKd = 0;

let tppRankedGames = 0;
let tppRankedAdr = 0;

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

        const rankedFpp = rankedStats['squad-fpp'] || {};
const rankedTpp = rankedStats['squad'] || {};
        duo = rankedStats['duo'] || rankedStats['duo-fpp'] || {};

        rankedGames = rankedFpp.roundsPlayed || 0;
rankedAdr = rankedGames ? Math.round(rankedFpp.damageDealt / rankedGames) : 0;
rankedKd = rankedGames ? (rankedFpp.kills / rankedGames) : 0;

        duoGames = duo.roundsPlayed || 0;
        duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
        duoKd = duoGames ? (duo.kills / duoGames) : 0;
        tppRankedGames = rankedTpp.roundsPlayed || 0;
tppRankedAdr = 0;

// если ranked TPP есть
if (tppRankedGames > 0) {
  tppRankedAdr = Math.round(rankedTpp.damageDealt / tppRankedGames);
} else {
  // если ranked TPP нет → берем обычный TPP squad
  tppRankedGames = tppGames;
  tppRankedAdr = tppAdr;
}

        rp = rankedFpp.currentRankPoint || 0;
tier = rankedFpp.currentTier?.tier || "UNRANKED";
subTier = rankedFpp.currentTier?.subTier || "";

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

if (fppGames > 0) {
  await give(getFppAdrRole(fppAdr));
}

if (rankedGames > 0) {
  await give(getRankedAdrRole(rankedAdr));
}

if (tppRankedGames > 0) {
  await give(getTppAdrRole(tppRankedAdr));
}

if (duoGames > 0) {
  await give(getRankedDuoAdrRole(duoAdr));
}

if (fppGames > 0) {
  await give(getFppKdRole(fppKd));
}

if (rankedGames > 0) {
  await give(getRankedKdRole(rankedKd));
}

if (duoGames > 0) {
  await give(getRankedDuoKdRole(duoKd));
}
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
          
          `🟠 TPP SQUAD\n` +
          `🎮 Games: ${tppRankedGames}\n` +
          `💥 ADR: ${tppRankedAdr}\n\n` +

          `🟢 Роли: ${givenRoles.length ? givenRoles.join(', ') : 'нет'}`
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
setInterval(async () => {
  try {
    const channel = await client.channels.fetch(MATCH_CHANNEL_ID);
    if (!channel) return;

const db = loadDB();
const player = "osuzhdalo";

// INIT
db[player] ??= {
  kills: 0,
  assists: 0,
  damage: 0,
  lastMatchId: null,
  bestKills: 0
};

// 1. получаем playerId
const playerRes = await axios.get(...);

// 2. matches
if (!playerRes.data?.data?.length) return;

const playerData = playerRes.data.data[0];

const matches = playerData?.relationships?.matches?.data;

if (!Array.isArray(matches)) {
 console.log("STEP 1");
const playerRes = await axios.get(...);

console.log("STEP 2");
const matches = playerRes.data.data[0].relationships.matches.data;

console.log("STEP 3");
const lastMatchId = matches[0].id;

console.log("STEP 4");
const matchRes = await axios.get(...);

console.log("STEP 5");
// анти-дубль
if (db[player].lastMatchId === lastMatchId) return;

// 3. матч
const matchRes = await axios.get(
  `${PUBG_API}/matches/${lastMatchId}`,
  {
    headers: {
      Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
      Accept: "application/vnd.api+json"
    }
  }
);

// 4. stats
const participants = (matchRes.data?.included ?? []).filter(
  x => x.type === "participant"
);

const me = participants.find(p =>
  p?.attributes?.stats?.name?.toLowerCase() === player.toLowerCase()
);

if (!me?.attributes?.stats) return;

const s = me.attributes.stats;


const s = me.attributes.stats;
const stats = {
  name: player,
  kills: s.kills,
  assists: s.assists,
  damage: s.damageDealt,
  rank: "PUBG MATCH",
  win: s.winPlace === 1
};

// 5. type
let type = null;

const isRecord = stats.kills > (db[player].bestKills || 0);
const isWin = stats.win;

if (isRecord) type = "record";
else if (isWin) type = "win";

    if (!type) {
      // всё равно сохраняем матч, чтобы не ловить дубли
      db[player].lastMatchId = lastMatchId;
      saveDB(db);
      return;
    }

    // 7. обновление базы
db[player] = {
  ...db[player],
  kills: stats.kills,
  assists: stats.assists,
  damage: stats.damage,
  lastMatchId: lastMatchId,
  bestKills: Math.max(db[player].bestKills || 0, stats.kills)
};

    saveDB(db);

    // 8. картинка
    const buffer = await createMatchCard(stats, type);

    await channel.send({
      content:
        type === "win"
          ? `🏆 ${player} WON THE MATCH!`
          : `🔥 NEW KILL RECORD: ${stats.kills}`,
      files: [{ attachment: buffer, name: "match.png" }]
    });

} catch (e) {

  console.log("========== MATCH ERROR ==========");

  console.log(e);

  if (e.response) {
    console.log("STATUS:", e.response.status);
    console.log("DATA:", e.response.data);
  }

  console.log("================================");
}
}, 60000);
client.login(process.env.DISCORD_TOKEN);
