// Serverless relay for cloud-assisted tag scanning. This is the one place
// in the app where a photo leaves the device — everything else in
// src/utils/ocr.js runs fully on-device. The client only calls this when
// local OCR (ocr.js) leaves brand or price blank; see AddEntry.jsx for the
// escalation trigger.
//
// The Gemini API key lives only in this function's environment
// (GEMINI_API_KEY, set in Vercel project settings / .env.local for dev) —
// it is never sent to or bundled into client code.

import { GoogleGenAI } from '@google/genai'
import { Redis } from '@upstash/redis'
import { CATEGORIES } from '../src/utils/grouping.js'
import { CURRENCIES } from '../src/utils/currency.js'

// Generous ceiling for a 1600px JPEG (see cloudScan.js) - blocks someone
// from posting an oversized payload to inflate token cost per call.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

// Per-IP throttle against the endpoint being hammered directly (the app
// itself has no login, so this is public-facing). Separate from the daily
// usage counters below, which track legitimate volume rather than abuse.
const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_MAX_CALLS = 10

// Flash is Gemini's cost/speed-optimized tier - the equivalent choice to
// Haiku on the Anthropic side for this kind of bounded extraction task.
// Using the "-latest" alias rather than a pinned version (e.g.
// gemini-2.5-flash) since Google retires specific dated versions for new
// API keys on their own schedule - this alias is Google's own mechanism
// for always pointing at whichever flash model is currently supported.
const MODEL = 'gemini-flash-latest'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const redis =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
    : null

function taxonomyText() {
  return CATEGORIES.map((c) => {
    const subs = c.subcategories.length ? c.subcategories.join(', ') : '(no subcategories)'
    return `- ${c.value}: ${subs}`
  }).join('\n')
}

function buildPrompt() {
  return `You are reading a price tag or product label photographed in a store. Extract what you can and respond with ONLY a JSON object — no markdown, no explanation, no other text.

{
  "brand": string or null,
  "price": string or null (digits only, no currency symbol or thousands separators),
  "currency": one of ${JSON.stringify(CURRENCIES)} or null,
  "category": one of ${JSON.stringify(CATEGORIES.map((c) => c.value))} or null,
  "subcategory": string or null — must be one of the listed subcategories for whichever category you chose, or null if that category has none or you're not sure
}

Category -> valid subcategory options:
${taxonomyText()}

If a field can't be confidently determined from the photo, use null for it — do not guess.`
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (redis) {
    try {
      const ip = getClientIp(req)
      const calls = await redis.incr(`ratelimit:${ip}`)
      if (calls === 1) await redis.expire(`ratelimit:${ip}`, RATE_LIMIT_WINDOW_SECONDS)
      if (calls > RATE_LIMIT_MAX_CALLS) {
        res.status(429).json({ error: 'Too many requests, try again shortly.' })
        return
      }
    } catch {
      // If the rate limiter itself is unavailable, fail open rather than
      // blocking every request over a Redis hiccup.
    }
  }

  const { image, mediaType } = req.body || {}
  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'Missing image' })
    return
  }
  const approxBytes = (image.length * 3) / 4
  if (approxBytes > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: 'Image too large' })
    return
  }

  let parsed = null
  try {
    const response = await genAI.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mediaType || 'image/jpeg', data: image } },
            { text: buildPrompt() },
          ],
        },
      ],
      config: {
        // A harder photo (glare, clutter) previously exhausted a 300-token
        // budget on internal reasoning before the model ever got to
        // writing the JSON answer (finishReason: MAX_TOKENS, no JSON in
        // the output at all). Tried disabling reasoning outright via
        // thinkingConfig: { thinkingBudget: 0 }, but whatever model
        // "gemini-flash-latest" currently resolves to rejects that field
        // entirely (400 INVALID_ARGUMENT) - so instead just budgeting
        // generously enough to cover reasoning + the actual JSON.
        maxOutputTokens: 1024,
        // Ask Gemini to emit JSON directly rather than free text we then
        // have to fish a JSON object out of - extractJson() below is just
        // a safety net in case it still wraps the output in stray text.
        responseMimeType: 'application/json',
      },
    })
    parsed = response.text ? extractJson(response.text) : null
  } catch (err) {
    res.status(502).json({ error: 'Cloud scan failed', detail: String(err?.message || err) })
    return
  }

  if (!parsed) {
    res.status(502).json({ error: 'Could not parse model response' })
    return
  }

  if (redis) {
    try {
      await redis.incr('usage:total')
      await redis.incr(`usage:${todayKey()}`)
    } catch {
      // Usage tracking is a bonus signal, not required for the scan itself.
    }
  }

  res.status(200).json({
    brand: typeof parsed.brand === 'string' ? parsed.brand : '',
    price: typeof parsed.price === 'string' ? parsed.price : '',
    currency: typeof parsed.currency === 'string' ? parsed.currency : '',
    category: typeof parsed.category === 'string' ? parsed.category : '',
    subcategory: typeof parsed.subcategory === 'string' ? parsed.subcategory : '',
  })
}
