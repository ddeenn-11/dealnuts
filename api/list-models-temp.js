// TEMPORARY diagnostic endpoint - lists models available to the configured
// GEMINI_API_KEY. Delete this file once the correct model name is confirmed
// in scan-tag.js; it should never ship long-term.
import { GoogleGenAI } from '@google/genai'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

export default async function handler(req, res) {
  try {
    const list = []
    const pager = await genAI.models.list()
    for await (const model of pager) {
      list.push({
        name: model.name,
        supportedActions: model.supportedActions,
      })
    }
    res.status(200).json({ models: list })
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err) })
  }
}
