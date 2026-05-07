if (interaction.commandName === 'stats') {
  const nickname = interaction.options.getString('nickname');

  try {
    await interaction.deferReply();

    const member = interaction.member;
    const guild = interaction.guild;

    // REMOVE REGISTERED
    const regRole = guild.roles.cache.find(r => r.name === "REGISTERED");
    if (regRole && member.roles.cache.has(regRole.id)) {
      await member.roles.remove(regRole);
    }

    // NICK
    if (member.manageable) {
      try { await member.setNickname(nickname); } catch {}
    }

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

    // NORMAL STATS
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

    const tpp = stats['squad'] || {};
    const fpp = stats['squad-fpp'] || {};

    const fppGames = fpp.roundsPlayed || 0;
    const fppAdr = fppGames ? Math.round(fpp.damageDealt / fppGames) : 0;
    const fppKd = fppGames ? (fpp.kills / fppGames) : 0;

    // ===== RANKED =====
    let ranked = {};
    let duo = {};
    let rankedStats = {};

    let rankedGames = 0, rankedAdr = 0, rankedKd = 0;
    let duoGames = 0, duoAdr = 0, duoKd = 0;

    let tier = "UNRANKED", subTier = "", rp = 0;

    // TPP CALC
    let rankedTpp = {};
    let tppGames = 0, rankedTppGames = 0;
    let tppAdr = 0, rankedTppAdr = 0;
    let finalTppAdr = 0;

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

      rankedStats = rankedRes.data.data.attributes.rankedGameModeStats || {};

      ranked = rankedStats['squad'] || {};
      duo = rankedStats['duo'] || {};
      rankedTpp = rankedStats['squad'] || rankedStats['squad-fpp'] || {};

      rankedGames = ranked.roundsPlayed || 0;
      rankedAdr = rankedGames ? Math.round(ranked.damageDealt / rankedGames) : 0;
      rankedKd = rankedGames ? (ranked.kills / rankedGames) : 0;

      duoGames = duo.roundsPlayed || 0;
      duoAdr = duoGames ? Math.round(duo.damageDealt / duoGames) : 0;
      duoKd = duoGames ? (duo.kills / duoGames) : 0;

      tppGames = tpp.roundsPlayed || 0;
      rankedTppGames = rankedTpp.roundsPlayed || 0;

      tppAdr = tppGames ? Math.round(tpp.damageDealt / tppGames) : 0;
      rankedTppAdr = rankedTppGames ? Math.round(rankedTpp.damageDealt / rankedTppGames) : 0;

      finalTppAdr = rankedTppGames > 0 ? rankedTppAdr : tppAdr;

      rp = ranked.currentRankPoint || 0;
      tier = ranked.currentTier?.tier || "UNRANKED";
      subTier = ranked.currentTier?.subTier || "";

    } catch {}

    // GIVE ROLE FUNCTION
    const givenRoles = [];

    async function give(roleName) {
      const role = guild.roles.cache.find(r => r.name === roleName);
      if (role && role.position < guild.members.me.roles.highest.position) {
        await member.roles.add(role);
        givenRoles.push(role.name);
      }
    }

    // CLEAN ROLES
    for (const role of guild.roles.cache.values()) {
      if (member.roles.cache.has(role.id)) {
        if (ALL_ROLES.includes(role.name)) {
          if (role.position < guild.members.me.roles.highest.position) {
            await member.roles.remove(role);
          }
        }
      }
    }

    // GIVE ROLES
    await give(getRankRoleName(tier, subTier));
    await give(getFppAdrRole(fppAdr));
    await give(getRankedAdrRole(rankedAdr));
    await give(getRankedDuoAdrRole(duoAdr));
    await give(getFppKdRole(fppKd));
    await give(getRankedKdRole(rankedKd));
    await give(getRankedDuoKdRole(duoKd));

    // TPP ADR (без слома системы)
    await give(getFppAdrRole(finalTppAdr));

    // EMBED
    const embed = new EmbedBuilder()
      .setColor("#2ecc71")
      .setTitle("📊 PUBG STATS")
      .setDescription(
        `**${nickname}**\n\n` +

        `🔵 NORMAL FPP\n` +
        `🎮 Games: ${fppGames}\n` +
        `💥 ADR: ${fppAdr}\n` +
        `🔫 KD: ${fppKd.toFixed(2)}\n\n` +

        `🏆 RANKED\n` +
        `🎖 Rank: ${tier} ${subTier}\n` +
        `💠 RP: ${rp}\n` +
        `🎮 Games: ${rankedGames}\n` +
        `💥 ADR: ${rankedAdr}\n` +
        `🔫 KD: ${rankedKd.toFixed(2)}\n\n` +

        `👥 DUO\n` +
        `🎮 Games: ${duoGames}\n` +
        `💥 ADR: ${duoAdr}\n` +
        `🔫 KD: ${duoKd.toFixed(2)}\n\n` +

        `🟡 TPP MODE\n` +
        `🎮 Ranked TPP Games: ${rankedTppGames}\n` +
        `🎮 Normal TPP Games: ${tppGames}\n` +
        `💥 TPP ADR: ${finalTppAdr}\n\n` +

        `🟢 Roles: ${givenRoles.length ? givenRoles.join(', ') : 'none'}`
      );

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.log(err);
    await interaction.editReply("❌ Ошибка");
  }
}
