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

// ===== REGISTERED =====
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

// ===== ALL ROLES =====
const ALL_ROLES = [
  "FPP ADR 350+","FPP ADR 300+","FPP ADR 250+","FPP ADR 200+","FPP ADR 100+",
  "TPP ADR 350+","TPP ADR 300+","TPP ADR 250+","TPP ADR 200+","TPP ADR 150+","TPP ADR 100+",

  "RANKED ADR 350+","RANKED ADR 300+","RANKED ADR 250+","RANKED ADR 200+","RANKED ADR 150+","RANKED ADR 100+",

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

// ===== COMMAND =====
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

      // ===== FPP =====
      const fpp = stats['squad-fpp'] || {};
      const fppGames = fpp.roundsPlayed || 0;
      const fppAdr = fppGames ? Math.round(fpp.damageDealt / fppGames) : 0;
      const fppKd = fppGames ? (fpp.kills / fppGames) : 0;

      // ===== TPP =====
      const tpp = stats['squad'] || {};
      const tppGames = tpp.roundsPlayed || 0;
      const tppAdr = tppGames ? Math.round(tpp.damageDealt / tppGames) : 0;

      // ===== RANKED =====
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

      // ===== CLEAN ROLES =====
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

      // ===== GIVE ROLES =====
      await give(getRankRoleName(tier, subTier));
      await give(getFppAdrRole(fppAdr));
      await give(getTppAdrRole(tppAdr));
      await give(getRankedAdrRole(rankedAdr));
      await give(getRankedDuoAdrRole(duoAdr));
      await give(getRankedKdRole(rankedKd));
      await give(getRankedDuoKdRole(duoKd));

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +

          `🔵 FPP\nGames: ${fppGames}\nADR: ${fppAdr}\nKD: ${fppKd.toFixed(2)}\n\n` +

          `🟠 TPP\nGames: ${tppGames}\nADR: ${tppAdr}\n\n` +

          `🏆 RANKED\nRank: ${tier} ${subTier}\nRP: ${rp}\nGames: ${rankedGames}\nADR: ${rankedAdr}\nKD: ${rankedKd.toFixed(2)}\n\n` +

          `🟢 Роли: ${givenRoles.join(', ') || 'нет'}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});

// ===== REGISTERED DM =====
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
      "👉 /stats ник\n\n" +
      "⚠️ Без /stats нет доступа"
    );
  } catch {
    console.log("Не вдалося надіслати ЛС");
  }
});

client.login(process.env.DISCORD_TOKEN);
