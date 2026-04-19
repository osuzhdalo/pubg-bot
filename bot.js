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
  PermissionsBitField
} = require('discord.js');

const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates]
});

const PUBG_API = "https://api.pubg.com/shards/steam";

let roomId = 1;
const rooms = new Map();

// ===== REGISTERED =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) await member.roles.add(role).catch(()=>{});
});

// ===== ФУНКЦИИ РОЛЕЙ =====
function getRankedAdrRole(adr) {
  if (adr >= 300) return "RANKED ADR 300+";
  if (adr >= 250) return "RANKED ADR 250+";
  if (adr >= 200) return "RANKED ADR 200+";
  return null;
}

function getRankedKdRole(kd) {
  if (kd >= 2) return "RANKED KD 2+";
  if (kd >= 1.5) return "RANKED KD 1.5+";
  if (kd >= 1) return "RANKED KD 1+";
  return null;
}

function getRankRoleName(tier, subTier) {
  if (!tier || !subTier) return null;
  const formatted = tier.charAt(0) + tier.slice(1).toLowerCase();
  return `${formatted} ${subTier}`;
}

// ===== READY =====
client.once('ready', async () => {
  console.log(`Бот запущен: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('PUBG статистика')
      .addStringOption(o =>
        o.setName('nickname')
          .setDescription('Ник')
          .setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );
});

// ===== АВТОКОМНАТЫ =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    if (!newState.channel) return;

    if (newState.channel.name === "СОЗДАТЬ ADR RANKED") {

      const guild = newState.guild;

      const voice = await guild.channels.create({
        name: `ADR RANKED #${roomId}`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parent
      });

      const text = await guild.channels.create({
        name: `чат-${roomId}`,
        type: ChannelType.GuildText,
        parent: newState.channel.parent
      });

      rooms.set(voice.id, {
        owner: newState.member.id,
        textId: text.id
      });

      roomId++;

      await newState.setChannel(voice);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('200').setLabel('200+').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('250').setLabel('250+').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('300').setLabel('300+').setStyle(ButtonStyle.Primary)
      );

      await text.send({
        content: `🎯 <@${newState.member.id}> выбери ADR`,
        components: [row]
      });
    }

    if (oldState.channel && rooms.has(oldState.channel.id)) {
      if (oldState.channel.members.size === 0) {

        const room = rooms.get(oldState.channel.id);
        const text = oldState.guild.channels.cache.get(room.textId);

        if (text) await text.delete().catch(()=>{});
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

  // ===== BUTTON =====
  if (interaction.isButton()) {
    try {
      const entry = [...rooms.entries()].find(([id, r]) => r.owner === interaction.user.id);
      if (!entry) return interaction.deferUpdate();

      const [voiceId, room] = entry;
      const voice = interaction.guild.channels.cache.get(voiceId);

      let roleName = null;
      if (interaction.customId === '200') roleName = "RANKED ADR 200+";
      if (interaction.customId === '250') roleName = "RANKED ADR 250+";
      if (interaction.customId === '300') roleName = "RANKED ADR 300+";

      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      await voice.permissionOverwrites.set([
        { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect] },
        { id: role.id, allow: [PermissionsBitField.Flags.Connect] }
      ]);

      await interaction.update({
        content: `✅ Только для ${roleName}`,
        components: []
      });

    } catch (e) {
      console.log("BUTTON ERROR:", e.message);
    }
    return;
  }

  // ===== SLASH =====
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    const nickname = interaction.options.getString('nickname');

    try {
      await interaction.deferReply();

      const member = interaction.member;
      const guild = interaction.guild;

      // УБРАТЬ REGISTERED
      const reg = guild.roles.cache.find(r => r.name === "REGISTERED");
      if (reg) await member.roles.remove(reg).catch(()=>{});

      // PLAYER
      const playerRes = await axios.get(`${PUBG_API}/players?filter[playerNames]=${nickname}`, {
        headers: {
          Authorization: `Bearer ${process.env.PUBG_API_KEY}`,
          Accept: 'application/vnd.api+json'
        }
      });

      const playerId = playerRes.data.data[0]?.id;
      if (!playerId) return interaction.editReply("❌ Игрок не найден");

      const seasonRes = await axios.get(`${PUBG_API}/seasons`, {
        headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}` }
      });

      const seasonId = seasonRes.data.data.find(s => s.attributes.isCurrentSeason).id;

      const rankedRes = await axios.get(
        `${PUBG_API}/players/${playerId}/seasons/${seasonId}/ranked`,
        { headers: { Authorization: `Bearer ${process.env.PUBG_API_KEY}` } }
      );

      const ranked = rankedRes.data.data.attributes.rankedGameModeStats['squad'] || {};

      const games = ranked.roundsPlayed || 0;
      const adr = games ? Math.round(ranked.damageDealt / games) : 0;
      const kd = games ? (ranked.kills / games) : 0;

      const tier = ranked.currentTier?.tier || "UNRANKED";
      const subTier = ranked.currentTier?.subTier || "";
      const rp = ranked.currentRankPoint || 0;

      const rolesToGive = [
        getRankRoleName(tier, subTier),
        getRankedAdrRole(adr),
        getRankedKdRole(kd)
      ];

      for (const r of rolesToGive) {
        if (!r) continue;

        const role = guild.roles.cache.find(x => x.name === r);
        if (!role) continue;

        if (role.position < guild.members.me.roles.highest.position) {
          await member.roles.add(role).catch(()=>{});
        }
      }

      const embed = new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("📊 PUBG STATS")
        .setDescription(
          `**${nickname}**\n\n` +
          `🎖 ${tier} ${subTier}\n` +
          `💠 RP: ${rp}\n` +
          `🎮 Games: ${games}\n` +
          `💥 ADR: ${adr}\n` +
          `🔫 KD: ${kd.toFixed(2)}`
        );

      await interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.log(e.response?.data || e.message);
      await interaction.editReply("❌ Ошибка PUBG API");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
