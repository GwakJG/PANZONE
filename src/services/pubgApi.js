const API_BASE = '/api/pubg'

async function request(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Search player by name → try both platforms, pick the one with data.
export async function searchPlayer(name) {
  let fallback = null
  for (const plat of ['steam', 'kakao']) {
    try {
      const data = await request(
        `${API_BASE}/players?name=${encodeURIComponent(name)}&platform=${plat}`
      )
      const player = data.data?.[0]
      if (player) {
        const matchIds = player.relationships?.matches?.data?.map(m => m.id) || []
        const result = {
          id: player.id,
          name: player.attributes.name,
          platform: plat,
          matchIds,
        }
        // If player has matches, use this platform
        if (matchIds.length > 0) return result
        // Otherwise save as fallback and try next
        if (!fallback) fallback = result
      }
    } catch {
      // not found on this platform, try next
    }
  }
  if (fallback) return fallback
  throw new Error('Player not found')
}

// Get player's best ranked tier across all modes for current season
export async function getPlayerTier(name, platform) {
  try {
    // If platform known, skip auto-detect
    let playerId, plat
    if (platform && platform !== 'auto') {
      const data = await request(
        `${API_BASE}/players?name=${encodeURIComponent(name)}&platform=${platform}`
      )
      playerId = data.data?.[0]?.id
      plat = platform
    } else {
      const player = await searchPlayer(name)
      playerId = player.id
      plat = player.platform
    }
    if (!playerId) return null

    const seasonsData = await request(`${API_BASE}/seasons?platform=${plat}`)
    const current = seasonsData.data.find(s => s.attributes.isCurrentSeason)
    if (!current) return null

    const ranked = await request(
      `${API_BASE}/players/${playerId}/seasons/${current.id}/ranked?platform=${plat}`
    ).catch(() => null)

    const modes = ranked?.data?.attributes?.rankedGameModeStats
    if (!modes) return null

    let best = null
    for (const key of Object.keys(modes)) {
      const m = modes[key]
      if (m.roundsPlayed > 0 && m.currentTier) {
        if (!best || m.currentRankPoint > best.rp) {
          best = {
            tier: m.currentTier.tier,
            subTier: m.currentTier.subTier,
            rp: m.currentRankPoint,
          }
        }
      }
    }
    return best
  } catch {
    return null
  }
}

// Get seasons list
export async function getSeasons(platform) {
  const data = await request(`${API_BASE}/seasons?platform=${platform}`)
  return data.data
    .filter(s => s.attributes.isCurrentSeason || !s.attributes.isOffseason)
    .sort((a, b) => (a.id > b.id ? -1 : 1))
}

// Get season stats (normal)
export async function getSeasonStats(playerId, seasonId, platform) {
  const data = await request(
    `${API_BASE}/players/${playerId}/seasons/${seasonId}?platform=${platform}`
  )
  return data.data?.attributes?.gameModeStats || null
}

// Get ranked season stats
export async function getRankedStats(playerId, seasonId, platform) {
  const data = await request(
    `${API_BASE}/players/${playerId}/seasons/${seasonId}/ranked?platform=${platform}`
  )
  return data.data?.attributes?.rankedGameModeStats || null
}

// Get match detail (not rate limited)
export async function getMatch(matchId, platform) {
  return request(`${API_BASE}/matches/${matchId}?platform=${platform}`)
}

// Transform PUBG API season stats into our format
export function transformSeasonStats(raw) {
  if (!raw) return null

  function transform(modeData) {
    if (!modeData || modeData.roundsPlayed === 0) return null
    const m = modeData
    return {
      matches: m.roundsPlayed,
      wins: m.wins,
      kd: m.losses > 0 ? +(m.kills / m.losses).toFixed(2) : m.kills,
      kda: m.losses > 0 ? +((m.kills + m.assists) / m.losses).toFixed(2) : m.kills + m.assists,
      damagePerMatch: +(m.damageDealt / Math.max(m.roundsPlayed, 1)).toFixed(0),
      winRate: +((m.wins / m.roundsPlayed) * 100).toFixed(1),
      top10Rate: +((m.top10s / m.roundsPlayed) * 100).toFixed(1),
      longestKill: +m.longestKill.toFixed(1),
      avgSurvivalTime: +(m.timeSurvived / m.roundsPlayed / 60).toFixed(1),
      headshotRate: m.kills > 0 ? +((m.headshotKills / m.kills) * 100).toFixed(1) : 0,
      avgRank: +(m.rankPoints || 0).toFixed(1),
      avgKills: +(m.kills / m.roundsPlayed).toFixed(2),
      avgAssists: +(m.assists / m.roundsPlayed).toFixed(2),
    }
  }

  function combineStats(...modes) {
    const valid = modes.filter(Boolean)
    if (valid.length === 0) return null
    const total = {
      roundsPlayed: 0, wins: 0, kills: 0, assists: 0, losses: 0,
      damageDealt: 0, top10s: 0, longestKill: 0, timeSurvived: 0,
      headshotKills: 0, rankPoints: 0,
    }
    for (const m of valid) {
      total.roundsPlayed += m.roundsPlayed || 0
      total.wins += m.wins || 0
      total.kills += m.kills || 0
      total.assists += m.assists || 0
      total.losses += m.losses || 0
      total.damageDealt += m.damageDealt || 0
      total.top10s += m.top10s || 0
      total.longestKill = Math.max(total.longestKill, m.longestKill || 0)
      total.timeSurvived += m.timeSurvived || 0
      total.headshotKills += m.headshotKills || 0
    }
    return total
  }

  const soloFpp = raw['solo-fpp'] || null
  const duoFpp = raw['duo-fpp'] || null
  const squadFpp = raw['squad-fpp'] || null
  const soloTpp = raw['solo'] || null
  const duoTpp = raw['duo'] || null
  const squadTpp = raw['squad'] || null

  return {
    fpp: {
      overall: transform(combineStats(soloFpp, duoFpp, squadFpp)),
      solo: transform(soloFpp),
      duo: transform(duoFpp),
      squad: transform(squadFpp),
    },
    tpp: {
      overall: transform(combineStats(soloTpp, duoTpp, squadTpp)),
      solo: transform(soloTpp),
      duo: transform(duoTpp),
      squad: transform(squadTpp),
    },
  }
}

// Transform ranked stats
export function transformRankedStats(raw) {
  if (!raw) return { fpp: { overall: null, solo: null, duo: null, squad: null }, tpp: { overall: null, solo: null, duo: null, squad: null } }

  function transform(modeData) {
    if (!modeData || modeData.roundsPlayed === 0) return null
    const m = modeData
    return {
      matches: m.roundsPlayed,
      wins: m.wins,
      kd: m.deaths > 0 ? +(m.kills / m.deaths).toFixed(2) : m.kills,
      kda: m.deaths > 0 ? +((m.kills + m.assists) / m.deaths).toFixed(2) : m.kills + m.assists,
      damagePerMatch: +(m.damageDealt / Math.max(m.roundsPlayed, 1)).toFixed(0),
      winRate: m.winRatio != null ? +(m.winRatio * 100).toFixed(1) : +((m.wins / m.roundsPlayed) * 100).toFixed(1),
      top10Rate: m.top10Ratio != null ? +(m.top10Ratio * 100).toFixed(1) : 0,
      longestKill: +(m.longestKill || 0).toFixed(1),
      avgSurvivalTime: +(m.avgSurvivalTime || 0).toFixed(1),
      headshotRate: m.headshotKillRatio != null ? +(m.headshotKillRatio * 100).toFixed(1) : (m.kills > 0 ? +((m.headshotKills / m.kills) * 100).toFixed(1) : 0),
      avgRank: +(m.avgRank || 0).toFixed(1),
      avgKills: m.avgKill != null ? +m.avgKill.toFixed(2) : +(m.kills / m.roundsPlayed).toFixed(2),
      avgAssists: +(m.assists / m.roundsPlayed).toFixed(2),
    }
  }

  function combineRanked(...modes) {
    const valid = modes.filter(Boolean)
    if (valid.length === 0) return null
    const total = {
      roundsPlayed: 0, wins: 0, kills: 0, assists: 0, deaths: 0,
      damageDealt: 0, headshotKills: 0, longestKill: 0,
      avgSurvivalTime: 0, avgRank: 0,
      // weighted sums for ratio fields
      _top10Sum: 0, _headshotRatioSum: 0, _avgKillSum: 0,
    }
    for (const m of valid) {
      const rp = m.roundsPlayed || 0
      total.roundsPlayed += rp
      total.wins += m.wins || 0
      total.kills += m.kills || 0
      total.assists += m.assists || 0
      total.deaths += m.deaths || 0
      total.damageDealt += m.damageDealt || 0
      total.headshotKills += m.headshotKills || 0
      total.longestKill = Math.max(total.longestKill, m.longestKill || 0)
      total.avgSurvivalTime += (m.avgSurvivalTime || 0) * rp
      total.avgRank += (m.avgRank || 0) * rp
      total._top10Sum += (m.top10Ratio || 0) * rp
      total._headshotRatioSum += (m.headshotKillRatio || 0) * rp
      total._avgKillSum += (m.avgKill || 0) * rp
    }
    if (total.roundsPlayed > 0) {
      total.avgSurvivalTime /= total.roundsPlayed
      total.avgRank /= total.roundsPlayed
      total.top10Ratio = total._top10Sum / total.roundsPlayed
      total.headshotKillRatio = total._headshotRatioSum / total.roundsPlayed
      total.avgKill = total._avgKillSum / total.roundsPlayed
      total.winRatio = total.wins / total.roundsPlayed
    }
    return total
  }

  function extractTier(modeData) {
    if (!modeData || !modeData.currentTier || modeData.roundsPlayed === 0) return null
    return {
      tier: modeData.currentTier.tier,
      subTier: modeData.currentTier.subTier,
      rp: modeData.currentRankPoint || 0,
    }
  }

  function bestTier(...tiers) {
    const valid = tiers.filter(Boolean)
    if (valid.length === 0) return null
    return valid.reduce((best, t) => (!best || t.rp > best.rp) ? t : best, null)
  }

  const duoFpp = raw['duo-fpp'] || null
  const squadFpp = raw['squad-fpp'] || null
  const duoTpp = raw['duo'] || null
  const squadTpp = raw['squad'] || null

  const duoFppTier = extractTier(duoFpp)
  const squadFppTier = extractTier(squadFpp)
  const duoTppTier = extractTier(duoTpp)
  const squadTppTier = extractTier(squadTpp)

  const fppOverall = transform(combineRanked(duoFpp, squadFpp))
  const tppOverall = transform(combineRanked(duoTpp, squadTpp))
  if (fppOverall) fppOverall.tier = bestTier(duoFppTier, squadFppTier)
  if (tppOverall) tppOverall.tier = bestTier(duoTppTier, squadTppTier)

  const fppDuo = transform(duoFpp)
  const fppSquad = transform(squadFpp)
  const tppDuo = transform(duoTpp)
  const tppSquad = transform(squadTpp)
  if (fppDuo) fppDuo.tier = duoFppTier
  if (fppSquad) fppSquad.tier = squadFppTier
  if (tppDuo) tppDuo.tier = duoTppTier
  if (tppSquad) tppSquad.tier = squadTppTier

  return {
    fpp: {
      overall: fppOverall,
      duo: fppDuo,
      squad: fppSquad,
    },
    tpp: {
      overall: tppOverall,
      duo: tppDuo,
      squad: tppSquad,
    },
  }
}
