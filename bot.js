require('dotenv').config();

const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder,
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

// ===== АВТО КОМНАТЫ =====
let roomId = 1;
const tempRooms = new Map();

// ===== ВХОД =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role);
});

// ===== VOICE =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  const join = newState.channel;
  const leave = oldState.channel;

  // СОЗДАНИЕ КОМНАТЫ
  if (join && join.name === "СОЗДАТЬ ADR RANKED") {
    const guild = newState.guild;

    const newChannel = await guild.channels.create({
      name: `RANKED #${roomId++}`,
      type: 2,
      parent: join.parent
    });

    tempRooms.set(newChannel.id, true);

    await newState.setChannel(newChannel);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adr200').setLabel('200+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adr250').setLabel('250+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adr300').setLabel('300+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('kick').setLabel('Выгнать').setStyle(ButtonStyle.Danger)
    );

    const textChannel = guild.channels.cache.find(c => c.name.includes("регистрация"));

    if (textChannel) {
      textChannel.send({
        content: `🎮 ${newState.member}, настрой комнату ${newChannel.name}`,
        components: [row]
      });
    }
  }

  // УДАЛЕНИЕ
  if (leave && tempRooms.has(leave.id)) {
    if (leave.members.size === 0) {
      await leave.delete();
      tempRooms.delete(leave.id);
    }
  }
});

// ===== КНОПКИ + КОМАНДА =====
client.on('interactionCreate', async (interaction) => {

  // ===== КНОПКИ =====
  if (interaction.isButton()) {
    const member = interaction.member;
    const channel = member.voice.channel;

    if (!channel) {
      return interaction.reply({ content: "❌ Ты не в комнате", ephemeral: true });
    }

    if (interaction.customId === "kick") {
      for (const m of channel.members.values()) {
        await m.voice.disconnect();
      }
      return interaction.reply("🚪 Все выгнаны");
    }

    let roleName;

    if (interaction.customId === "adr200") roleName = "RANKED ADR 200+";
    if (interaction.customId === "adr250") roleName = "RANKED ADR 250+";
    if (interaction.customId === "adr300") roleName = "RANKED ADR 300+";

    const role = interaction.guild.roles.cache.find(r => r.name === roleName);
    if (!role) return interaction.reply("❌ Нет роли");

    await channel.permissionOverwrites.set([
      {
        id: interaction.guild.roles.everyone.id,
        deny: ["Connect"]
      },
      {
        id: role.id,
        allow: ["Connect"]
      }
    ]);

    return interaction.reply(`✅ Доступ: ${roleName}`);
  }

  // ===== SLASH =====
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

      let ranked = {}, duo = {};
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

        ranked = rankedStats['squad'] || {};
        duo = rankedStats['duo'] || {};

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

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +

          `🔵 NORMAL\n` +
          `🎮 ${fppGames}\n💥 ${fppAdr}\n🔫 ${fppKd.toFixed(2)}\n\n` +

          `🏆 RANKED\n` +
          `🎖 ${tier} ${subTier}\n💠 ${rp}\n🎮 ${rankedGames}\n💥 ${rankedAdr}\n🔫 ${rankedKd.toFixed(2)}\n\n` +

          `👥 DUO\n` +
          `🎮 ${duoGames}\n💥 ${duoAdr}\n🔫 ${duoKd.toFixed(2)}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.log(err);
      await interaction.editReply("❌ Ошибка");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
