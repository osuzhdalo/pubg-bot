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

// ===== АВТОКОМНАТЫ =====
const AUTO_CHANNEL_NAME = "СОЗДАТЬ ADR RANKED";
let roomCounter = 1;
const activeRooms = new Map();

// ===== ВХОД =====
client.on('guildMemberAdd', async (member) => {
  const role = member.guild.roles.cache.find(r => r.name === "REGISTERED");
  if (role) {
    await member.roles.add(role).catch(()=>{});
  }
});

// ===== СОЗДАНИЕ КОМНАТ =====
client.on('voiceStateUpdate', async (oldState, newState) => {
  const channel = newState.channel;
  if (!channel) return;

  // если зашли в СОЗДАТЬ ADR RANKED
  if (channel.name === AUTO_CHANNEL_NAME) {

    const guild = channel.guild;

    const newChannel = await guild.channels.create({
      name: `ADR RANKED #${roomCounter++}`,
      type: ChannelType.GuildVoice,
      parent: channel.parent
    });

    activeRooms.set(newChannel.id, {
      owner: newState.member.id,
      limitRole: null
    });

    await newState.setChannel(newChannel);

    // создаем текстовый канал
    const textChannel = await guild.channels.create({
      name: `chat-${newChannel.name}`,
      type: ChannelType.GuildText,
      parent: channel.parent
    });

    activeRooms.get(newChannel.id).text = textChannel.id;

    // КНОПКИ
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('adr200').setLabel('200+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adr250').setLabel('250+').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('adr300').setLabel('300+').setStyle(ButtonStyle.Primary)
    );

    await textChannel.send({
      content: `🎯 <@${newState.member.id}> выбери лимит ADR:`,
      components: [row]
    });
  }

  // ===== УДАЛЕНИЕ КОМНАТЫ =====
  if (oldState.channel && activeRooms.has(oldState.channel.id)) {
    const ch = oldState.channel;
    if (ch.members.size === 0) {
      const data = activeRooms.get(ch.id);

      await ch.delete().catch(()=>{});

      if (data.text) {
        const text = oldState.guild.channels.cache.get(data.text);
        if (text) await text.delete().catch(()=>{});
      }

      activeRooms.delete(ch.id);
    }
  }
});

// ===== ОБРАБОТКА КНОПОК =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const channel = interaction.channel;
  const voice = [...activeRooms.entries()].find(([id, data]) => data.text === channel.id);

  if (!voice) return;

  const voiceChannel = interaction.guild.channels.cache.get(voice[0]);
  const room = voice[1];

  // только создатель
  if (interaction.user.id !== room.owner) {
    return interaction.reply({ content: "❌ Только создатель комнаты!", ephemeral: true });
  }

  let roleName = null;

  if (interaction.customId === 'adr200') roleName = "RANKED ADR 200+";
  if (interaction.customId === 'adr250') roleName = "RANKED ADR 250+";
  if (interaction.customId === 'adr300') roleName = "RANKED ADR 300+";

  const role = interaction.guild.roles.cache.find(r => r.name === roleName);
  if (!role) return;

  room.limitRole = role.id;

  await voiceChannel.permissionOverwrites.set([
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
    content: `✅ Установлен лимит: ${roleName}`,
    components: []
  });
});

// ===== ДАЛЬШЕ ТВОЯ СТАТИСТИКА (НЕ ТРОГАЛ) =====

// (весь твой код ниже оставляешь БЕЗ ИЗМЕНЕНИЙ)

client.login(process.env.DISCORD_TOKEN);
