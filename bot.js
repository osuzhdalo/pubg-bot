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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 5000
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id TEXT PRIMARY KEY,
        pubg_nickname TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    console.log("✅ База даних PostgreSQL успішно підключена та синхронізована!");
  } catch (err) {
    console.error("❌ Помилка ініціалізації бази даних:", err.message);
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

  setTimeout(() => {
    isProcessingQueue = false;
    processQueue();
  }, 3500);
}

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
  "Master"
];

const CREATE_CHANNELS = { "150": "1495532168946913310", "200": "1495532213674971147", "250": "1495532256410734824", "300": "1495532283354943508" };
const ADR_ROLES = { "150": "1495382626146717726", "200": "1495382551731110008", "250": "1495382501244403803", "300": "1495380338069999738", "350": "1495380397524123820" };
const counters = { 150: 0, 200: 0, 250: 0, 300: 0 };
const activeRooms = new Set();

function getFppAdrRole(adr) { return adr >= 350 ? "FPP ADR 350+" : adr >= 300 ? "FPP ADR 300+" : adr >= 250 ? "FPP ADR 250+" : adr >= 200 ? "FPP ADR 200+" : adr >= 150 ? "FPP ADR 150+" : "FPP ADR 100+"; }
function getRankedAdrRole(adr) { return adr >= 350 ? "RANKED ADR 350+" : adr >= 300 ? "RANKED ADR 300+" : adr >= 250 ? "RANKED ADR 250+" : adr >= 200 ? "RANKED ADR 200+" : adr >= 150 ? "RANKED ADR 150+" : "RANKED ADR 100+"; }
function getRankedDuoAdrRole(adr) { return adr >= 350 ? "RANKED DUO ADR 350+" : adr >= 300 ? "RANKED DUO ADR 300+" : adr >= 250 ? "RANKED DUO ADR 250+" : adr >= 200 ? "RANKED DUO ADR 200+" : adr >= 150 ? "RANKED DUO ADR 150+" : "RANKED DUO ADR 100+"; }
function getTppAdrRole(adr) { return adr >= 350 ? "TPP ADR 350+" : adr >= 300 ? "TPP ADR 300+" : adr >= 250 ? "TPP ADR 250+" : adr >= 200 ? "TPP ADR 200+" : adr >= 150 ? "TPP ADR 150+" : "TPP ADR 100+"; }
function getFppKdRole(kd) { return kd >= 2 ? "FPP KD 2+" : kd >= 1.5 ? "FPP KD 1.5+" : kd >= 1 ? "FPP KD 1+" : null; }
function getRankedKdRole(kd) { return kd >= 2 ? "RANKED KD 2+" : kd >= 1.5 ? "RANKED KD 1.5+" : kd >= 1 ? "RANKED KD 1+" : null; }
function getRankedDuoKdRole(kd) { return kd >= 2 ? "RANKED DUO KD 2+" : kd >= 1.5 ? "RANKED DUO KD 1.5+" : kd >= 1 ? "RANKED DUO KD 1+" : null; }

function getRankRoleName(tier, subTier) { 
  if (!tier || tier.toUpperCase() === "UNRANKED" || tier === "") return null; 
  const formattedTier = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  
  // Якщо це Master, він зазвичай без subTier
  if (formattedTier === "Master" || formattedTier === "Grandmaster") {
    return "Master";
  }

  // Для Bronze, Silver, Gold, Platinum, Diamond
  if (subTier && subTier !== "" && !isNaN(subTier)) {
    return `${formattedTier}${subTier}`;
  }
  return formattedTier; 
}

async function updatePlayerStatsAndRoles(member, nickname) {
  const guild = member.guild;

  const playerRes = await axios.get(`${PUBG_API}/players?filter[playerNames]=${encodeURIComponent(nickname)}`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  if (!playerRes.data.data.length) throw new Error("PLAYER_NOT_FOUND");
  const playerId = playerRes.data.data[0].id;

  const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

  // Отримання звичайної статистики
  const normalRes = await axios.get(`${PUBG_API}/players/${playerId}/seasons/${seasonId}`, {
    headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
  });
  const stats = normalRes.data.data.attributes.gameModeStats || {};
  const normalFpp = stats['squad-fpp'] || stats['duo-fpp'] || stats['solo-fpp'] || {};
  const normalTpp = stats['squad'] || stats['duo'] || stats['solo'] || {};

  const fppGames = normalFpp.roundsPlayed || 0;
  const fppAdr = fppGames ? Math.round(normalFpp.damageDealt / fppGames) : 0;
  const fppKd = fppGames ? (normalFpp.kills / fppGames) : 0;
  const fppWins = normalFpp.wins || 0;
  const fppWr = fppGames ? ((fppWins / fppGames) * 100).toFixed(1) : "0.0";

  const tppGames = normalTpp.roundsPlayed || 0;
  const tppAdr = tppGames ? Math.round(normalTpp.damageDealt / tppGames) : 0;

  // Отримання рангової статистики (з виправленим парсингом)
  let rankedGames = 0, rankedAdr = 0, rankedKd = 0, duoGames = 0, duoAdr = 0, duoKd = 0, tppRankedGames = 0, tppRankedAdr = 0;
  let rankedWr = "0.0", duoWr = "0.0";
  let tier = "UNRANKED", subTier = "", rp = 0;

  try {
    const rankedRes = await axios.get(`${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`, {
      headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
    });
    
    const rankedStats = rankedRes.data.data.attributes.rankedGameModeStats || {};
    
    // Шукаємо ранг у squad-fpp, або в будь-якому іншому доступному ключі рангу
    const rankedFpp = rankedStats['squad-fpp'] || rankedStats['squad'] || {};
    const duo = rankedStats['duo-fpp'] || rankedStats['duo'] || {};
    const rankedTpp = rankedStats['squad'] || {};

    rankedGames = rankedFpp.roundsPlayed || 0;
    rankedAdr = rankedGames ? Math.round(rankedFpp.damageDealt / rankedGames) : 0;
    rankedKd = rankedGames ? (rankedFpp.kills / rankedGames) : 0;
    const rankedWins = rankedFpp.wins || 0;
    rankedWr = rankedGames ? ((rankedWins / rankedGames) * 100).toFixed(1) : "0.0";

    duoGames = duo.roundsPlayed || 0;
    duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
    duoKd = duoGames ? (duo.kills / duoGames) : 0;
    const duoWins = duo.wins || 0;
    duoWr = duoGames ? ((duoWins / duoGames) * 100).toFixed(1) : "0.0";

    tppRankedGames = rankedTpp.roundsPlayed || 0;
    if (tppRankedGames > 0) {
      tppRankedAdr = Math.round(rankedTpp.damageDealt / tppRankedGames);
    } else {
      tppRankedGames = tppGames;
      tppRankedAdr = tppAdr;
    }

    rp = rankedFpp.currentRankPoint || rankedFpp.currentRankPoints || 0;
    
    // Надійне витягування тиру та субтиру з об'єкта
    if (rankedFpp.currentTier && rankedFpp.currentTier.tier) {
      tier = rankedFpp.currentTier.tier;
      subTier = rankedFpp.currentTier.subTier ? String(rankedFpp.currentTier.subTier) : "";
    } else if (rankedFpp.tier) {
      tier = rankedFpp.tier;
      subTier = rankedFpp.subTier ? String(rankedFpp.subTier) : "";
    }
  } catch (e) {
    console.log("Помилка отримання рангу (можливо, гравець не грав у ранкед):", e.message);
    tppRankedGames = tppGames;
    tppRankedAdr = tppAdr;
  }

  // Очищення старих ролей
  const rolesToRemove = member.roles.cache.filter(role => ALL_ROLES.includes(role.name));
  for (const [id, role] of rolesToRemove) {
    if (role.position < guild.members.me.roles.highest.position) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  // Формування списку нових ролей
  const rolesToGiveNames = [];
  
  const rankRoleName = getRankRoleName(tier, subTier);
  if (rankRoleName) {
    rolesToGiveNames.push(rankRoleName);
  }

  if (fppGames > 0) { 
    rolesToGiveNames.push(getFppAdrRole(fppAdr)); 
    const fKdRole = getFppKdRole(fppKd);
    if (fKdRole) rolesToGiveNames.push(fKdRole);
  }
  if (rankedGames > 0) { 
    rolesToGiveNames.push(getRankedAdrRole(rankedAdr)); 
    const rKdRole = getRankedKdRole(rankedKd);
    if (rKdRole) rolesToGiveNames.push(rKdRole);
  }
  if (tppRankedGames > 0) { 
    rolesToGiveNames.push(getTppAdrRole(tppRankedAdr)); 
  }
  if (duoGames > 0) { 
    rolesToGiveNames.push(getRankedDuoAdrRole(duoAdr)); 
    const dKdRole = getRankedDuoKdRole(duoKd);
    if (dKdRole) rolesToGiveNames.push(dKdRole);
  }

  for (const rName of rolesToGiveNames) {
    if (!rName) continue;
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === rName.toLowerCase());
    if (role && role.position < guild.members.me.roles.highest.position) {
      await member.roles.add(role).catch(() => {});
    }
  }

  const regRole = guild.roles.cache.find(r => r.name === "REGISTERED");
  if (regRole && member.roles.cache.has(regRole.id)) {
    await member.roles.remove(regRole).catch(() => {});
  }

  if (guild.ownerId !== member.id && member.manageable) {
    try {
      await member.setNickname(nickname);
    } catch (err) {}
  }

  return { fppGames, fppAdr, fppKd, fppWr, tier, subTier, rp, rankedGames, rankedAdr, rankedKd, rankedWr, duoGames, duoAdr, duoKd, duoWr, tppRankedGames, tppRankedAdr, givenRoles: rolesToGiveNames };
}

client.once('ready', async () => {
  console.log(`Бот запущен як ${client.user.tag}`);
  await initDatabase();

  const commands = [
    new SlashCommandBuilder()
      .setName('setup-registration')
      .setDescription('Надіслати інтерактивну плашку реєстрації в поточний канал')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  } catch (e) { console.log("Помилка реєстрації команд:", e); }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-registration') {
    const embed = new EmbedBuilder()
      .setColor('#c0392b') 
      .setTitle('🎮 РЕЄСТРАЦІЯ НА СЕРВЕРІ')
      .setDescription(
        'Вітаємо! Щоб отримати доступ до ігрових каналів та автоматичних ролей на основі вашої статистики, пройдіть швидку авторизацію.\n\n' +
        '**Натисніть червону кнопку нижче та введіть свій точний ігровий нікнейм у PUBG.**'
      )
      .setFooter({ text: 'PUBG Auto-Verification' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('register_btn')
        .setLabel('Зареєструватись 🔥')
        .setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({ content: '✅ Панель реєстрації успішно створено!', ephemeral: true });
    return interaction.channel.send({ embeds: [embed], components: [row] });
  }

  if (interaction.isButton() && interaction.customId === 'register_btn') {
    const modal = new ModalBuilder()
      .setCustomId('reg_modal')
      .setTitle('Реєстрація PUBG');

    const nicknameInput = new TextInputBuilder()
      .setCustomId('pubg_nick')
      .setLabel('Введіть ваш точний нікнейм PUBG (Steam)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Приклад: osuzhdalo')
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(16);

    const row = new ActionRowBuilder().addComponents(nicknameInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'reg_modal') {
    await interaction.deferReply({ ephemeral: false }); 

    const nickname = interaction.fields.getTextInputValue('pubg_nick').trim();
    const discordId = interaction.user.id;

    try {
      await interaction.editReply("⏳ Оновлюю статистику та підбираю ролі... Зачекайте будь ласка.");

      const data = await addToQueue(() => updatePlayerStatsAndRoles(interaction.member, nickname));

      await pool.query(
        "INSERT INTO users (discord_id, pubg_nickname, updated_at) VALUES ($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET pubg_nickname = EXCLUDED.pubg_nickname, updated_at = EXCLUDED.updated_at",
        [discordId, nickname, Date.now()]
      );

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle(`📊 СТАТИСТИКА ГРАВЦЯ: ${nickname.toUpperCase()}`) 
        .setDescription(`👤 **Профіль користувача:** <@${discordId}>\n\n`)
        .addFields(
          { 
            name: '🔵 NORMAL SQUAD FPP', 
            value: `🎮 **Ігри:** \`${data.fppGames}\`\n💥 **ADR:** \`${data.fppAdr}\`\n🔫 **K/D:** \`${data.fppKd.toFixed(2)}\`\n🏆 **Win Rate:** \`${data.fppWr}%\``, 
            inline: true 
          },
          { 
            name: '🏆 RANKED SQUAD FPP', 
            value: `🎖 **Ранг:** \`${data.tier} ${data.subTier}\`\n💠 **RP:** \`${data.rp}\`\n🎮 **Ігри:** \`${data.rankedGames}\`\n💥 **ADR:** \`${data.rankedAdr}\`\n🔫 **K/D:** \`${data.rankedKd.toFixed(2)}\`\n🏆 **Win Rate:** \`${data.rankedWr}%\``, 
            inline: true 
          },
          { name: '\u200B', value: '\u200B', inline: false }, 
          { 
            name: '👥 RANKED DUO FPP', 
            value: `🎮 **Ігри:** \`${data.duoGames}\`\n💥 **ADR:** \`${data.duoAdr}\`\n🔫 **K/D:** \`${data.duoKd.toFixed(2)}\`\n🏆 **Win Rate:** \`${data.duoWr}%\``, 
            inline: true 
          },
          { 
            name: '🟠 TPP SQUAD', 
            value: `🎮 **Ігри:** \`${data.tppRankedGames}\`\n💥 **ADR:** \`${data.tppRankedAdr}\``, 
            inline: true 
          },
          { name: '\u200B', value: '\u200B', inline: false },
          { 
            name: '🟢 ОТРИМАНІ РОЛІ НА СЕРВЕРІ', 
            value: data.givenRoles.length ? `\`${data.givenRoles.join('\`, \` ')}\`` : '*Не отримано жодної нової ролі*' 
          }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ content: '✅ Реєстрація пройшла успішно! Ваші ролі та нікнейм оновлено.', embeds: [embed] });

      // Перенесення плашки вниз каналу
      const channel = interaction.channel;
      if (channel) {
        try {
          const messages = await channel.messages.fetch({ limit: 15 });
          const oldBanner = messages.find(m => m.author.id === client.user.id && m.components.some(row => row.components.some(c => c.customId === 'register_btn')));
          
          if (oldBanner) {
            await oldBanner.delete().catch(() => {});
          }

          const regEmbed = new EmbedBuilder()
            .setColor('#c0392b')
            .setTitle('🎮 РЕЄСТРАЦІЯ НА СЕРВЕРІ')
            .setDescription(
              'Вітаємо! Щоб отримати доступ до ігрових каналів та автоматичних ролей на основі вашої статистики, пройдіть швидку авторизацію.\n\n' +
              '**Натисніть червону кнопку нижче та введіть свій точний ігровий нікнейм у PUBG.**'
            )
            .setFooter({ text: 'PUBG Auto-Verification' });

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('register_btn')
              .setLabel('Зареєструватись 🔥')
              .setStyle(ButtonStyle.Danger)
          );

          await channel.send({ embeds: [regEmbed], components: [row] });
        } catch (e) {
          console.error("Не вдалося перемістити плашку вниз:", e);
        }
      }

    } catch (err) {
      console.error(err);
      
      let userMessage = `❌ Сталася помилка при реєстрації: ${err.message}`;

      if (err.message === "PLAYER_NOT_FOUND") {
        userMessage = "❌ Гравець з таким ніком не знайдений у базі PUBG Steam. Перевірте правильність написання нікнейму!";
      } else if (err.response) {
        const status = err.response.status;
        if (status === 429) {
          userMessage = "⏳ Занадто багато запитів до PUBG API. Будь ласка, зачекайте кілька секунд і спробуйте зареєструватися знову.";
        } else if (status === 404) {
          userMessage = "❌ Гравець не знайдений або профіль закритий / не існує в цій мережі.";
        } else if (status === 401 || status === 403) {
          userMessage = "❌ Помилка авторизації бота в PUBG API. Повідомте адміністратора сервера.";
        } else if (status >= 500) {
          userMessage = "❌ Офіційні сервери PUBG зараз відпочивають або лежать (помилка 5xx). Спробуйте пізніше.";
        }
      }

      await interaction.editReply(userMessage);
    }
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    const guild = newState.guild;
    const member = newState.member;

    for (const adr in CREATE_CHANNELS) {
      if (newState.channelId === CREATE_CHANNELS[adr] && oldState.channelId !== CREATE_CHANNELS[adr]) {
        counters[adr]++;
        const number = counters[adr];

        const permissionOverwrites = [
          { id: guild.roles.everyone.id, deny: ['Connect'] },
          { id: client.user.id, allow: ['ViewChannel', 'Connect', 'ManageChannels'] }
        ];

        for (const roleIdAdr in ADR_ROLES) {
          if (parseInt(roleIdAdr) >= parseInt(adr)) {
            permissionOverwrites.push({ id: ADR_ROLES[roleIdAdr], allow: ['Connect', 'ViewChannel'] });
          }
        }

        const room = await guild.channels.create({
          name: `🎯 ADR RANKED ${adr}+ #${number}`,
          type: ChannelType.GuildVoice,
          parent: newState.channel.parentId,
          userLimit: 4,
          permissionOverwrites: permissionOverwrites
        });

        activeRooms.add(room.id);
        await member.voice.setChannel(room).catch(() => {});
      }
    }

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
  } catch (err) { console.log("VOICE ERROR:", err); }
});

client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role).catch(() => {});
});

client.login(process.env.DISCORD_TOKEN);
