require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 5000 // если база не ответит за 5 сек, бот не зависнет
});

// Проверка подключения и создание таблицы при старте
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        pubg_nickname TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    console.log("✅ База данных PostgreSQL успешно подключена и синхронизирована!");
  } catch (err) {
    console.error("❌ Ошибка инициализации базы данных:", err.message);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

const PUBG_API = "https://api.pubg.com/shards/steam";
const REGISTRATION_CHANNEL_ID = "1495396009939828867";

// Очередь для запросов к PUBG API (защита от лимитов, 7.5 секунд)
const requestQueue = [];
let isProcessingQueue = false;

function addToQueue(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;

  const { task, resolve, reject } = requestQueue.shift();
  try {
    const result = await task();
    resolve(result);
  } catch (error) {
    reject(error);
  }

  // Ожидание 7.5 секунд перед следующим запросом к PUBG API
  setTimeout(() => {
    isProcessingQueue = false;
    processQueue();
  }, 7500);
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

const CREATE_CHANNELS = { "150": "1495532168946913310", "200": "1495532213674971147", "250": "1495532256410734824", "300": "1495532283354943508" };
const ADR_ROLES = { "150": "1495382626146717726", "200": "1495382551731110008", "250": "1495382501244403803", "300": "1495380338069999738", "350": "1495380397524123820" };
const counters = { 150: 0, 200: 0, 250: 0, 300: 0 };
const activeRooms = new Set();

// Вспомогательные функции для ролей
function getFppAdrRole(adr) { return adr >= 350 ? "FPP ADR 350+" : adr >= 300 ? "FPP ADR 300+" : adr >= 250 ? "FPP ADR 250+" : adr >= 200 ? "FPP ADR 200+" : adr >= 150 ? "FPP ADR 150+" : "FPP ADR 100+"; }
function getRankedAdrRole(adr) { return adr >= 350 ? "RANKED ADR 350+" : adr >= 300 ? "RANKED ADR 300+" : adr >= 250 ? "RANKED ADR 250+" : adr >= 200 ? "RANKED ADR 200+" : adr >= 150 ? "RANKED ADR 150+" : "RANKED ADR 100+"; }
function getRankedDuoAdrRole(adr) { return adr >= 350 ? "RANKED DUO ADR 350+" : adr >= 300 ? "RANKED DUO ADR 300+" : adr >= 250 ? "RANKED DUO ADR 250+" : adr >= 200 ? "RANKED DUO ADR 200+" : adr >= 150 ? "RANKED DUO ADR 150+" : "RANKED DUO ADR 100+"; }
function getTppAdrRole(adr) { return adr >= 350 ? "TPP ADR 350+" : adr >= 300 ? "TPP ADR 300+" : adr >= 250 ? "TPP ADR 250+" : adr >= 200 ? "TPP ADR 200+" : adr >= 150 ? "TPP ADR 150+" : "TPP ADR 100+"; }
function getFppKdRole(kd) { return kd >= 2 ? "FPP KD 2+" : kd >= 1.5 ? "FPP KD 1.5+" : kd >= 1 ? "FPP KD 1+" : null; }
function getRankedKdRole(kd) { return kd >= 2 ? "RANKED KD 2+" : kd >= 1.5 ? "RANKED KD 1.5+" : kd >= 1 ? "RANKED KD 1+" : null; }
function getRankedDuoKdRole(kd) { return kd >= 2 ? "RANKED DUO KD 2+" : kd >= 1.5 ? "RANKED DUO KD 1.5+" : kd >= 1 ? "RANKED DUO KD 1+" : null; }
function getRankRoleName(tier, subTier) { if (!tier || tier === "UNRANKED") return null; const formatted = tier.charAt(0) + tier.slice(1).toLowerCase(); return subTier ? `${formatted} ${subTier}` : formatted; }

// Общая функция запроса к API и обновления ролей
async function updatePlayerStatsAndRoles(member, nickname) {
  const guild = member.guild;

  // 1. Получение Player ID
  const playerRes = await axios.get(`${PUBG_API}/players?filter[playerNames]=${nickname}`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  if (!playerRes.data.data.length) throw new Error("PLAYER_NOT_FOUND");
  const playerId = playerRes.data.data[0].id;

  // 2. Получение текущего сезона
  const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

  // 3. Получение обычных стат
  const normalRes = await axios.get(`${PUBG_API}/players/${playerId}/seasons/${seasonId}`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  const stats = normalRes.data.data.attributes.gameModeStats;
  const normalFpp = stats['squad-fpp'] || {};
  const normalTpp = stats['squad'] || {};

  const fppGames = normalFpp.roundsPlayed || 0;
  const fppAdr = fppGames ? Math.round(normalFpp.damageDealt / fppGames) : 0;
  const fppKd = fppGames ? (normalFpp.kills / fppGames) : 0;
  const tppGames = normalTpp.roundsPlayed || 0;
  const tppAdr = tppGames ? Math.round(normalTpp.damageDealt / tppGames) : 0;

  // 4. Получение ранговых стат
  let rankedGames = 0, rankedAdr = 0, rankedKd = 0, duoGames = 0, duoAdr = 0, duoKd = 0, tppRankedGames = 0, tppRankedAdr = 0;
  let tier = "UNRANKED", subTier = "", rp = 0;

  try {
    const rankedRes = await axios.get(`${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`, {
      headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
    });
    const rankedStats = rankedRes.data.data.attributes.rankedGameModeStats;
    const rankedFpp = rankedStats['squad-fpp'] || {};
    const rankedTpp = rankedStats['squad'] || {};
    const duo = rankedStats['duo'] || rankedStats['duo-fpp'] || {};

    rankedGames = rankedFpp.roundsPlayed || 0;
    rankedAdr = rankedGames ? Math.round(rankedFpp.damageDealt / rankedGames) : 0;
    rankedKd = rankedGames ? (rankedFpp.kills / rankedGames) : 0;

    duoGames = duo.roundsPlayed || 0;
    duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
    duoKd = duoGames ? (duo.kills / duoGames) : 0;

    tppRankedGames = rankedTpp.roundsPlayed || 0;
    if (tppRankedGames > 0) {
      tppRankedAdr = Math.round(rankedTpp.damageDealt / tppRankedGames);
    } else {
      tppRankedGames = tppGames;
      tppRankedAdr = tppAdr;
    }

    rp = rankedFpp.currentRankPoint || 0;
    tier = rankedFpp.currentTier?.tier || "UNRANKED";
    subTier = rankedFpp.currentTier?.subTier || "";
  } catch (e) {
    tppRankedGames = tppGames;
    tppRankedAdr = tppAdr;
  }

  // Очистка старых ролей
  const rolesToRemove = member.roles.cache.filter(role => ALL_ROLES.includes(role.name));
  for (const [id, role] of rolesToRemove) {
    if (role.position < guild.members.me.roles.highest.position) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  // Сбор новых ролей
  const rolesToGiveNames = [];
  if (tier && tier !== "UNRANKED") rolesToGiveNames.push(getRankRoleName(tier, subTier));
  if (fppGames > 0) { rolesToGiveNames.push(getFppAdrRole(fppAdr)); rolesToGiveNames.push(getFppKdRole(fppKd)); }
  if (rankedGames > 0) { rolesToGiveNames.push(getRankedAdrRole(rankedAdr)); rolesToGiveNames.push(getRankedKdRole(rankedKd)); }
  if (tppRankedGames > 0) { rolesToGiveNames.push(getTppAdrRole(tppRankedAdr)); }
  if (duoGames > 0) { rolesToGiveNames.push(getRankedDuoAdrRole(duoAdr)); rolesToGiveNames.push(getRankedDuoKdRole(duoKd)); }

  const givenRoles = [];
  for (const rName of rolesToGiveNames) {
    if (!rName) continue;
    const role = guild.roles.cache.find(r => r.name === rName);
    if (role && role.position < guild.members.me.roles.highest.position) {
      await member.roles.add(role).catch(() => {});
      givenRoles.push(role.name);
    }
  }

  // Снятие роли REGISTERED
  const regRole = guild.roles.cache.find(r => r.name === "REGISTERED");
  if (regRole && member.roles.cache.has(regRole.id)) {
    await member.roles.remove(regRole).catch(() => {});
  }

  // Смена ника
  if (member.manageable && member.displayName !== nickname) {
    await member.setNickname(nickname).catch(() => {});
  }

  return { fppGames, fppAdr, fppKd, tier, subTier, rp, rankedGames, rankedAdr, rankedKd, duoGames, duoAdr, duoKd, tppRankedGames, tppRankedAdr, givenRoles };
}

// Фоновое автообновление (раз в 3 дня) из PostgreSQL
async function startAutoUpdateScheduler() {
  setInterval(async () => {
    console.log("[Крон] Запущено автообновление ролей из PostgreSQL...");
    try {
      const res = await pool.query("SELECT * FROM users");
      const users = res.rows;

      for (const user of users) {
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            const member = await guild.members.fetch(user.discord_id).catch(() => null);
            if (!member) continue;

            console.log(`[Крон] Добавление в очередь автообновления: ${user.pubg_nickname}`);
            
            addToQueue(() => updatePlayerStatsAndRoles(member, user.pubg_nickname))
              .then(async () => {
                await pool.query("UPDATE users SET updated_at = $1 WHERE discord_id = $2", [Date.now(), user.discord_id]);
                console.log(`[Крон] Успешно обновлен: ${user.pubg_nickname}`);
              })
              .catch(err => console.log(`[Крон] Ошибка автообновления ${user.pubg_nickname}:`, err.message));
              
          } catch (err) {
            console.log("[Крон] Ошибка обработки участника:", err.message);
          }
        }
      }
    } catch (dbErr) {
      console.error("[Крон] Ошибка чтения из базы данных:", dbErr.message);
    }
  }, 3 * 24 * 60 * 60 * 1000); // Интервал 3 дня
}

client.once('ready', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  // Инициализация таблицы в PostgreSQL
  await initDatabase();

  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('PUBG статистика и вечная регистрация')
      .addStringOption(option =>
        option.setName('nickname')
          .setDescription('Ник игрока в PUBG')
          .setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  } catch (e) { console.log("Ошибка регистрации команд:", e); }

  // Запуск планировщика обновлений
  startAutoUpdateScheduler();
});

// Обработка команды /stats
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    if (interaction.channelId !== REGISTRATION_CHANNEL_ID) {
      return interaction.reply({ content: '❌ Команда доступна только в канале #реєстрація', ephemeral: true });
    }

    // СРАЗУ говорим Дискорду, что мы работаем, чтобы не было ошибки "Приложение не отвечает"
    await interaction.deferReply();

    const nickname = interaction.options.getString('nickname');
    const discordId = interaction.user.id;

    try {
      // Проверяем вечную регистрацию в PostgreSQL
      const existingUserRes = await pool.query("SELECT * FROM users WHERE discord_id = $1", [discordId]);
      if (existingUserRes.rows.length > 0) {
        return interaction.editReply({ 
          content: `❌ Вы уже привязали PUBG аккаунт под ником **${existingUserRes.rows[0].pubg_nickname}**. Ваш ник сохранен навсегда в облачной базе. Повторно использовать /stats не нужно!`
        });
      }

      await interaction.editReply("⏳ Твой запрос поставлен в очередь PUBG API (задержка до 7 секунд для защиты от лимитов)...");
      
      // Отправляем задачу в очередь с задержкой 7 секунд
      const data = await addToQueue(() => updatePlayerStatsAndRoles(interaction.member, nickname));

      // Сохраняем в PostgreSQL навсегда
      await pool.query(
        "INSERT INTO users (discord_id, pubg_nickname, updated_at) VALUES ($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET pubg_nickname = EXCLUDED.pubg_nickname, updated_at = EXCLUDED.updated_at",
        [discordId, nickname, Date.now()]
      );

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +
          `🔵 NORMAL SQUAD\n` +
          `🎮 Games: ${data.fppGames}\n` +
          `💥 ADR: ${data.fppAdr}\n` +
          `🔫 KD: ${data.fppKd.toFixed(2)}\n\n` +
          `🏆 RANKED SQUAD\n` +
          `🎖 Rank: ${data.tier} ${data.subTier}\n` +
          `💠 RP: ${data.rp}\n` +
          `🎮 Games: ${data.rankedGames}\n` +
          `💥 ADR: ${data.rankedAdr}\n` +
          `🔫 KD: ${data.rankedKd.toFixed(2)}\n\n` +
          `👥 RANKED DUO\n` +
          `🎮 Games: ${data.duoGames}\n` +
          `💥 ADR: ${data.duoAdr}\n` +
          `🔫 KD: ${data.duoKd.toFixed(2)}\n\n` +
          `🟠 TPP SQUAD\n` +
          `🎮 Games: ${data.tppRankedGames}\n` +
          `💥 ADR: ${data.tppRankedAdr}\n\n` +
          `🟢 Новые Роли: ${data.givenRoles.length ? data.givenRoles.join(', ') : 'нет'}`
        );

      await interaction.editReply({ content: '✅ Успешно зарегистрировано и сохранено навсегда!', embeds: [embed] });

    } catch (err) {
      console.error("ОШИБКА В КОМАНДЕ STATS:", err);
      await interaction.editReply({ content: `❌ Произошла ошибка: ${err.message}. Проверьте логи на Railway.` });
    }
  }
});

      await interaction.editReply({ content: '✅ Успешно зарегистрировано и сохранено навсегда!', embeds: [embed] });

    } catch (err) {
      console.log(err);
      if (err.message === "PLAYER_NOT_FOUND") {
        await interaction.editReply("❌ Игрок не найден в базе PUBG Steam. Проверьте правильность написания ника.");
      } else {
        await interaction.editReply("❌ Произошла ошибка базы данных или PUBG API. Попробуйте позже.");
      }
    }
  }
});

// Голосовые комнаты (Автосоздание и проверка лимитов)
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guild = newState.guild;
    const member = newState.member;

    // Создание комнат
    for (const adr in CREATE_CHANNELS) {
      if (newState.channelId === CREATE_CHANNELS[adr] && oldState.channelId !== CREATE_CHANNELS[adr]) {
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

    // Фильтрация игроков по ADR ролям при входе
    if (newState.channelId && activeRooms.has(newState.channelId)) {
      const channel = newState.channel;
      const match = channel.name.match(/ADR RANKED (\d+)\+/);

      if (match) {
        const requiredAdr = parseInt(match[1]);
        const hasAccess = Object.keys(ADR_ROLES).some(adr => {
          return parseInt(adr) >= requiredAdr && member.roles.cache.has(ADR_ROLES[adr]);
        });

        if (!hasAccess) {
          setTimeout(() => {
            member.voice.setChannel(null).catch(() => {});
          }, 300);
        }
      }
    }

    // Удаление пустых динамических комнат
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

// Выдача роли REGISTERED при входе + Отправка ЛС
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) {
    await member.roles.add(role).catch(() => {});
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
    console.log("Не вдалося надіслати ЛС пользователю.");
  }
});

client.login(process.env.DISCORD_TOKEN);
