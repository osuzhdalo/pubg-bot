require('dotenv').config();

const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ChannelType, PermissionsBitField,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
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

const CREATE_CHANNEL = "СОЗДАТЬ ADR RANKED";

let roomId = 1;
const rooms = new Map();

// ===== ВХОД =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role).catch(()=>{});
});

// ===== АВТОКОМНАТЫ =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (!newState.channel) return;

    if (newState.channel.name === CREATE_CHANNEL) {

      const guild = newState.guild;

      const voice = await guild.channels.create({
        name: `ADR RANKED #${roomId++}`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parent
      });

      rooms.set(voice.id, {
        owner: newState.member.id
      });

      await newState.setChannel(voice);

      // ===== ОТПРАВКА В ЧАТ ГОЛОСОВОГО КАНАЛА =====
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('200').setLabel('200+').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('250').setLabel('250+').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('300').setLabel('300+').setStyle(ButtonStyle.Primary)
      );

      await voice.send({
        content: `🎯 <@${newState.member.id}> выбери лимит ADR:`,
        components: [row]
      });
    }

    // ===== УДАЛЕНИЕ =====
    if (oldState.channel && rooms.has(oldState.channel.id)) {
      if (oldState.channel.members.size === 0) {
        await oldState.channel.delete().catch(()=>{});
        rooms.delete(oldState.channel.id);
      }
    }

  } catch (e) {
    console.log("VOICE ERROR:", e.message);
  }
});

// ===== КНОПКИ =====
client.on('interactionCreate', async (interaction) => {

  if (interaction.isButton()) {
    try {
      const voice = interaction.channel;

      if (!rooms.has(voice.id)) return interaction.deferUpdate();

      const room = rooms.get(voice.id);

      if (interaction.user.id !== room.owner) {
        return interaction.reply({
          content: "❌ Только создатель комнаты!",
          ephemeral: true
        });
      }

      let roleName = null;

      if (interaction.customId === '200') roleName = "RANKED ADR 200+";
      if (interaction.customId === '250') roleName = "RANKED ADR 250+";
      if (interaction.customId === '300') roleName = "RANKED ADR 300+";

      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (!role) {
        return interaction.reply({
          content: "❌ Нет такой роли",
          ephemeral: true
        });
      }

      await voice.permissionOverwrites.set([
        {
          id: interaction.guild.roles.everyone,
          deny: [PermissionsBitField.Flags.Connect]
        },
        {
          id: role.id,
          allow: [PermissionsBitField.Flags.Connect]
        }
      ]);

      await interaction.update({
        content: `✅ Вход: ${roleName}`,
        components: []
      });

    } catch (e) {
      console.log("BUTTON ERROR:", e.message);
      try { await interaction.deferUpdate(); } catch {}
    }
  }

  // ===== /stats =====
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'stats') {

      const nickname = interaction.options.getString('nickname');

      try {
        await interaction.reply("⏳ Загружаю...");

        const member = interaction.member;
        const guild = interaction.guild;

        // убрать REGISTERED
        const reg = guild.roles.cache.find(r => r.name === "REGISTERED");
        if (reg && member.roles.cache.has(reg.id)) {
          await member.roles.remove(reg).catch(()=>{});
        }

        const playerRes = await axios.get(
          `${PUBG_API}/players?filter[playerNames]=${nickname}`,
          {
            timeout: 5000,
            headers: {
              Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
              Accept: 'application/vnd.api+json'
            }
          }
        ).catch(() => null);

        if (!playerRes || !playerRes.data.data.length) {
          return interaction.editReply("❌ Игрок не найден");
        }

        const playerId = playerRes.data.data[0].id;

        const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
          timeout: 5000,
          headers: {
            Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
            Accept: 'application/vnd.api+json'
          }
        });

        const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

        const normalRes = await axios.get(
          `${PUBG_API}/players/${playerId}/seasons/${seasonId}`,
          {
            timeout: 5000,
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

        let rankedGames = 0, rankedAdr = 0, rankedKd = 0;
        let duoGames = 0, duoAdr = 0, duoKd = 0;
        let tier = "Unranked", subTier = "", rp = 0;

        const rankedRes = await axios.get(
          `${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`,
          {
            timeout: 5000,
            headers: {
              Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
              Accept: 'application/vnd.api+json'
            }
          }
        ).catch(() => null);

        if (rankedRes) {
          const rankedStats = rankedRes.data.data.attributes.rankedGameModeStats;

          const squad = rankedStats['squad'] || {};
          const duo = rankedStats['duo'] || {};

          rankedGames = squad.roundsPlayed || 0;
          rankedAdr = rankedGames ? Math.round(squad.damageDealt / rankedGames) : 0;
          rankedKd = rankedGames ? (squad.kills / rankedGames) : 0;

          duoGames = duo.roundsPlayed || 0;
          duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
          duoKd = duoGames ? (duo.kills / duoGames) : 0;

          tier = squad.currentTier?.tier || "Unranked";
          subTier = squad.currentTier?.subTier || "";
          rp = squad.currentRankPoint || 0;
        }

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
            `🔫 KD: ${duoKd.toFixed(2)}`
          );

        await interaction.editReply({ content: "", embeds: [embed] });

      } catch (err) {
        console.log(err);
        await interaction.editReply("❌ Ошибка");
      }
    }
  }
});

// ===== КОМАНДА =====
client.once('ready', async () => {
  console.log(`Запущен: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('PUBG статистика')
      .addStringOption(option =>
        option.setName('nickname').setDescription('Ник').setRequired(true))
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
});

client.login(process.env.DISCORD_TOKEN);
