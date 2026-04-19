require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
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


// ===== REGISTERED =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role);
});


// ===== РОЛИ =====
function getFppAdrRole(adr) {
  if (adr >= 200) return "FPP ADR 200+";
  return null;
}

function getRankedAdrRole(adr) {
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  return null;
}

function getRankedDuoAdrRole(adr) {
  if (adr >= 300) return "RANKED DUO ADR 300+";
  if (adr >= 250) return "RANKED DUO ADR 250+";
  if (adr >= 200) return "RANKED DUO ADR 200+";
  return null;
}

function getFppKdRole(kd) {
  if (kd >= 1) return "FPP KD 1+";
  return null;
}

function getRankedKdRole(kd) {
  if (kd >= 1) return "RANKED KD 1+";
  return null;
}

function getRankedDuoKdRole(kd) {
  if (kd >= 1.5) return "RANKED DUO KD 1.5+";
  return null;
}

function getRankRoleName(tier, subTier) {
  if (!tier || !subTier) return null;
  return `${tier.charAt(0) + tier.slice(1).toLowerCase()} ${subTier}`;
}


// ===== КОМАНДА =====
client.once('ready', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('PUBG статистика')
      .addStringOption(option =>
        option.setName('nickname')
          .setDescription('Ник')
          .setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
});


// ===== STATS =====
client.on('interactionCreate', async (interaction) => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {

    const nickname = interaction.options.getString('nickname');
    const member = interaction.member;
    const guild = interaction.guild;

    await interaction.deferReply();

    // убрать REGISTERED
    const reg = guild.roles.cache.find(r => r.name === "REGISTERED");
    if (reg && member.roles.cache.has(reg.id)) await member.roles.remove(reg);

    // ник
    if (member.manageable) {
      try { await member.setNickname(nickname); } catch {}
    }

    try {
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

      // ===== NORMAL =====
      const normalRes = await axios.get(
        `${PUBG_API}/players/${playerId}/seasons/${seasonId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
            Accept: 'application/vnd.api+json'
          }
        }
      );

      const normalStats = normalRes.data.data.attributes.gameModeStats;
      const normal = normalStats['squad-fpp'] || normalStats['squad'] || {};

      const fppGames = normal.roundsPlayed || 0;
      const fppAdr = fppGames ? Math.round(normal.damageDealt / fppGames) : 0;
      const fppKd = fppGames ? (normal.kills / fppGames) : 0;

      // ===== RANKED =====
      let ranked = {};
      let duo = {};
      let tier = "Unranked";
      let subTier = "";
      let rp = 0;

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

        ranked = rankedStats['squad'] || {};
        duo = rankedStats['duo'] || {};

        tier = ranked.currentTier?.tier || "Unranked";
        subTier = ranked.currentTier?.subTier || "";
        rp = ranked.currentRankPoint || 0;

      } catch {}

      const rankedGames = ranked.roundsPlayed || 0;
      const rankedAdr = rankedGames ? Math.round(ranked.damageDealt / rankedGames) : 0;
      const rankedKd = rankedGames ? (ranked.kills / rankedGames) : 0;

      const duoGames = duo.roundsPlayed || 0;
      const duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
      const duoKd = duoGames ? (duo.kills / duoGames) : 0;

      // ===== РОЛИ =====
      const rolesGiven = [];

      async function give(roleName) {
        if (!roleName) return;
        const role = guild.roles.cache.find(r => r.name === roleName);
        if (role) {
          await member.roles.add(role);
          rolesGiven.push(role.name);
        }
      }

      await give(getRankRoleName(tier, subTier));
      await give(getFppAdrRole(fppAdr));
      await give(getRankedAdrRole(rankedAdr));
      await give(getRankedDuoAdrRole(duoAdr));
      await give(getFppKdRole(fppKd));
      await give(getRankedKdRole(rankedKd));
      await give(getRankedDuoKdRole(duoKd));

      // ===== EMBED =====
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

          `🟢 Роли: ${rolesGiven.join(', ') || 'нет'}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
