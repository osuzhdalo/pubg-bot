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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates]
});

const PUBG_API = "https://api.pubg.com/shards/steam";


// ===== REGISTERED =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role);
});


// ===== ADR =====
function getRankedAdrRole(adr) {
  if (adr >= 350) return "RANKED ADR 350+";
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  return null;
}

function getRankedDuoAdrRole(adr) {
  if (adr >= 350) return "RANKED DUO ADR 350+";
  if (adr >= 300) return "RANKED DUO ADR 300+";
  if (adr >= 250) return "RANKED DUO ADR 250+";
  if (adr >= 200) return "RANKED DUO ADR 200+";
  return null;
}


// ===== KD =====
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

  // ===== КНОПКИ =====
  if (interaction.isButton()) {
    const voiceId = [...rooms.keys()].find(id =>
      rooms.get(id).textId === interaction.channel.id
    );

    if (!voiceId) return;

    const data = rooms.get(voiceId);

    if (interaction.user.id !== data.owner) {
      return interaction.reply({ content: "❌ Только создатель", ephemeral: true });
    }

    let roleName;

    if (interaction.customId === '200') roleName = "RANKED ADR 200+";
    if (interaction.customId === '250') roleName = "RANKED ADR 250+";
    if (interaction.customId === '300') roleName = "RANKED ADR 300+";

    const role = interaction.guild.roles.cache.find(r => r.name === roleName);
    const voice = interaction.guild.channels.cache.get(voiceId);

    if (role && voice) {
      await voice.permissionOverwrites.edit(role, { Connect: true });
      await voice.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false });
    }

    return interaction.update({
      content: `✅ Доступ: ${roleName}`,
      components: []
    });
  }


  // ===== СТАТС =====
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
      const playerRes = await axios.get(
        `${PUBG_API}/players?filter[playerNames]=${nickname}`,
        { headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' } }
      );

      if (!playerRes.data.data.length) {
        return interaction.editReply("❌ Игрок не найден");
      }

      const playerId = playerRes.data.data[0].id;

      const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
        headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' }
      });

      const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

      // ===== RANKED =====
      const rankedRes = await axios.get(
        `${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`,
        { headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}`, Accept: 'application/vnd.api+json' } }
      );

      const stats = rankedRes.data.data.attributes.rankedGameModeStats;

      const squad = stats['squad'] || {};
      const duo = stats['duo'] || {};

      const rankedGames = squad.roundsPlayed || 0;
      const rankedAdr = rankedGames ? Math.round(squad.damageDealt / rankedGames) : 0;
      const rankedKd = rankedGames ? (squad.kills / rankedGames) : 0;

      const duoGames = duo.roundsPlayed || 0;
      const duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
      const duoKd = duoGames ? (duo.kills / duoGames) : 0;

      const tier = squad.currentTier?.tier || "Unranked";
      const subTier = squad.currentTier?.subTier || "";
      const rp = squad.currentRankPoint || 0;

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
      await give(getRankedAdrRole(rankedAdr));
      await give(getRankedDuoAdrRole(duoAdr));
      await give(getRankedKdRole(rankedKd));
      await give(getRankedDuoKdRole(duoKd));

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +

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
      await interaction.editReply("❌ Ошибка API");
    }
  }
});


// ===== АВТО КОМНАТЫ =====
let roomId = 1;
const rooms = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {

  if (newState.channel && newState.channel.name === "СОЗДАТЬ ADR RANKED") {

    const guild = newState.guild;
    const member = newState.member;

    const voice = await guild.channels.create({
      name: `ADR RANKED #${roomId}`,
      type: ChannelType.GuildVoice,
      parent: newState.channel.parent
    });

    const text = await guild.channels.create({
      name: `ADR RANKED #${roomId}`,
      type: ChannelType.GuildText,
      parent: newState.channel.parent
    });

    roomId++;

    await member.voice.setChannel(voice);

    rooms.set(voice.id, {
      textId: text.id,
      owner: member.id
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('200').setLabel('200+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('250').setLabel('250+').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('300').setLabel('300+').setStyle(ButtonStyle.Danger)
    );

    await text.send({
      content: `<@${member.id}> выбери ADR`,
      components: [row]
    });
  }

  if (oldState.channel && rooms.has(oldState.channel.id)) {
    if (oldState.channel.members.size === 0) {
      const data = rooms.get(oldState.channel.id);

      const text = oldState.guild.channels.cache.get(data.textId);
      if (text) await text.delete();

      await oldState.channel.delete();
      rooms.delete(oldState.channel.id);
    }
  }
});


client.login(process.env.DISCORD_TOKEN);
