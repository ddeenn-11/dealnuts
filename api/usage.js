// Read-only usage counter for cloud-assisted scans (see scan-tag.js, which
// increments these on every successful cloud read). Deliberately its own
// endpoint rather than something shown in the app itself — visit this URL
// directly to check volume.

import { Redis } from '@upstash/redis'

const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
    : null

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (!redis) {
    res.status(503).json({ error: 'Usage tracking is not configured (missing KV_REST_API_URL/KV_REST_API_TOKEN)' })
    return
  }

  try {
    const today = todayKey()
    const [total, todayCount] = await Promise.all([redis.get('usage:total'), redis.get(`usage:${today}`)])
    res.status(200).json({
      total: Number(total) || 0,
      today: { date: today, count: Number(todayCount) || 0 },
    })
  } catch (err) {
    res.status(502).json({ error: 'Could not read usage', detail: String(err?.message || err) })
  }
}
