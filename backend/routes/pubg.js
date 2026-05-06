const express = require('express')
const router = express.Router()

const API_BASE = 'https://api.pubg.com'
const API_KEY = process.env.PUBG_API_KEY
const HEADERS = {
  'Authorization': `Bearer ${API_KEY}`,
  'Accept': 'application/vnd.api+json',
}

// --- Simple in-memory cache ---
const cache = new Map()
const CACHE_TTL = {
  players: 30 * 60 * 1000,       // 30 min (name → ID rarely changes)
  seasons: 30 * 60 * 1000,       // 30 min
  seasonStats: 20 * 60 * 1000,   // 20 min (aligns with PUBG 5-15 min post-match delay)
  matches: 60 * 60 * 1000,       // 1 hour (match data is immutable)
}

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > entry.ttl) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key, data, ttl) {
  cache.set(key, { data, time: Date.now(), ttl })
  // Prevent memory leak: cap at 500 entries
  if (cache.size > 500) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

// --- Rate limit retry helper ---
async function fetchWithRetry(url, headers, retries = 1) {
  const response = await fetch(url, { headers })
  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '2', 10)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return fetchWithRetry(url, headers, retries - 1)
  }
  return response
}

// GET /api/pubg/players?name=xxx&platform=steam|kakao
router.get('/players', async (req, res) => {
  const { name, platform } = req.query
  if (!name || !platform) {
    return res.status(400).json({ error: 'name and platform are required' })
  }

  const cacheKey = `players:${platform}:${name.toLowerCase()}`
  const cached = getCached(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await fetchWithRetry(
      `${API_BASE}/shards/${platform}/players?filter[playerNames]=${encodeURIComponent(name)}`,
      HEADERS
    )
    if (!response.ok) {
      const status = response.status
      if (status === 404) return res.status(404).json({ error: 'Player not found' })
      if (status === 429) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
      return res.status(status).json({ error: `PUBG API error: ${status}` })
    }
    const data = await response.json()
    setCache(cacheKey, data, CACHE_TTL.players)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/pubg/players/:id/seasons/:seasonId?platform=steam
router.get('/players/:id/seasons/:seasonId', async (req, res) => {
  const { id, seasonId } = req.params
  const { platform } = req.query
  if (!platform) return res.status(400).json({ error: 'platform is required' })

  const cacheKey = `stats:${platform}:${id}:${seasonId}`
  const cached = getCached(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await fetchWithRetry(
      `${API_BASE}/shards/${platform}/players/${id}/seasons/${seasonId}`,
      HEADERS
    )
    if (!response.ok) {
      if (response.status === 429) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
      return res.status(response.status).json({ error: `PUBG API error: ${response.status}` })
    }
    const data = await response.json()
    setCache(cacheKey, data, CACHE_TTL.seasonStats)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/pubg/players/:id/seasons/:seasonId/ranked?platform=steam
router.get('/players/:id/seasons/:seasonId/ranked', async (req, res) => {
  const { id, seasonId } = req.params
  const { platform } = req.query
  if (!platform) return res.status(400).json({ error: 'platform is required' })

  const cacheKey = `ranked:${platform}:${id}:${seasonId}`
  const cached = getCached(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await fetchWithRetry(
      `${API_BASE}/shards/${platform}/players/${id}/seasons/${seasonId}/ranked`,
      HEADERS
    )
    if (!response.ok) {
      if (response.status === 429) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
      return res.status(response.status).json({ error: `PUBG API error: ${response.status}` })
    }
    const data = await response.json()
    setCache(cacheKey, data, CACHE_TTL.seasonStats)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/pubg/seasons?platform=steam
router.get('/seasons', async (req, res) => {
  const { platform } = req.query
  if (!platform) return res.status(400).json({ error: 'platform is required' })

  const cacheKey = `seasons:${platform}`
  const cached = getCached(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await fetchWithRetry(
      `${API_BASE}/shards/${platform}/seasons`,
      HEADERS
    )
    if (!response.ok) {
      if (response.status === 429) return res.status(429).json({ error: 'Too many requests. Please try again shortly.' })
      return res.status(response.status).json({ error: `PUBG API error: ${response.status}` })
    }
    const data = await response.json()
    setCache(cacheKey, data, CACHE_TTL.seasons)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/pubg/matches/:id?platform=steam (not rate limited)
router.get('/matches/:id', async (req, res) => {
  const { id } = req.params
  const { platform } = req.query
  if (!platform) return res.status(400).json({ error: 'platform is required' })

  const cacheKey = `match:${platform}:${id}`
  const cached = getCached(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await fetch(
      `${API_BASE}/shards/${platform}/matches/${id}`,
      { headers: { 'Accept': 'application/vnd.api+json' } }
    )
    if (!response.ok) {
      return res.status(response.status).json({ error: `PUBG API error: ${response.status}` })
    }
    const data = await response.json()
    setCache(cacheKey, data, CACHE_TTL.matches)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
