// Best-effort, fully on-device tag scanning via Tesseract.js. Runs in the
// browser — no photo ever leaves the device. Accuracy on stylized price-tag
// fonts is inherently limited, so results are hints to prefill fields with,
// never auto-saved without the user seeing them first.

import { guessCategory } from './categorize.js'
import { guessColorFromText } from './colors.js'
import { dominantColorName } from './image.js'
import { matchLogo } from './logoMatch.js'

let workerPromise = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'))
  }
  return workerPromise
}

const SIZE_WORD_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/i
// A bare 1-2 digit number is only accepted as a size when it's not part of
// something else that also looks like a short number: a thousands-grouped
// price ("1,080"), a decimal price ("12.99"), or another digit run (a
// barcode fragment). The lookahead blocks a match that's immediately
// followed by ",digit" or ".digit" — a real half-size like "9.5" is still
// fine, since nothing follows the ".5".
const SIZE_NUMBER_TOKEN = /\b([0-9]{1,2}(?:\.5)?)\b(?![,.]\s?[0-9])/

// Ordered most-specific-first: an explicit currency mark wins over a bare
// decimal number, since tags often print a second unrelated decimal (a SKU
// fragment, a size like "10.5") that isn't the price. Decimals are
// optional throughout — plenty of real tags print whole-number prices
// ("HK$1,080") with no cents.
const PRICE_PATTERNS = [
  /(?:US\$|HK\$|R\$|C\$|A\$|NT\$|NZ\$|S\$|\$|£|€|¥|₩|฿)\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/, // $12.99, HK$1,299, HK$1,080
  /\bS\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\b/, // OCR often misreads "$" as "S"
  /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s?(?:USD|HKD|EUR|GBP|CNY|RMB|JPY|KRW|TWD|THB|SGD|CAD|AUD|NZD|CHF)\b/i, // "29.99 USD", "1080 HKD"
  /\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\b/, // bare decimal fallback — requires exactly 2 decimals (no currency marker anywhere else), so it won't grab a "9.5" size or a bare SKU number
]

// Any of the above, used to exclude price-looking lines from brand
// candidates below.
const PRICE_TOKEN = /(?:[$£€¥₩฿]|USD|HKD|EUR|GBP|CNY|RMB|JPY|KRW|TWD|THB|SGD|CAD|AUD|NZD|CHF)\s?[0-9]|[0-9](?:\.[0-9]{2})\b|[0-9](?:,[0-9]{3})\b/i

function guessPrice(text) {
  for (const pattern of PRICE_PATTERNS) {
    const match = text.match(pattern)
    if (match) return match[1].replace(/,/g, '')
  }
  return ''
}

// A bare number is a weak, easily-confused signal (list markers, barcode
// fragments, an unrelated number in a title) — an explicit size word is
// checked first, across the whole text, regardless of where it sits.
// Only if nothing like that exists do we fall back to a numeric candidate,
// and only from lines that aren't themselves a numbered list item
// ("1. This shirt's destination?"), a price (already handled by
// PRICE_TOKEN, reused here so a price line's own digits aren't grabbed), or
// a barcode/SKU digit run (e.g. "1 93659 43142 1" — all digits and
// whitespace, way more of them than any real size uses).
function guessSize(text) {
  const wordMatch = text.match(SIZE_WORD_TOKEN)
  if (wordMatch) return wordMatch[1].toUpperCase()

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[0-9]{1,2}[.)]\s/.test(trimmed)) continue
    if (PRICE_TOKEN.test(trimmed)) continue
    if (/^[0-9\s]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length > 3) continue
    const match = trimmed.match(SIZE_NUMBER_TOKEN)
    if (match) return match[1].toUpperCase()
  }
  return ''
}

// Brand names occasionally end in a digit (Dsquared2, G2000, Y-3) — the
// character class allows digits anywhere after the first letter so those
// aren't rejected, while still requiring the line to start with a letter
// (rules out pure SKU/barcode captions) and the price/all-numeric checks
// above still exclude tag-price and quantity lines.
function isBrandLikeLine(trimmed) {
  if (!trimmed || trimmed.length > 24) return false
  if (PRICE_TOKEN.test(trimmed) || /^[0-9.,\s]+$/.test(trimmed)) return false
  return /^[A-Za-z][A-Za-z0-9&'.\s-]*$/.test(trimmed)
}

// Fallback for when block/line geometry isn't available: the first short,
// letters-only line that isn't a price or size token. Frequently wrong —
// it's a starting point for the user to correct, not an authoritative read.
function guessBrandFromLines(lines) {
  for (const line of lines) {
    const trimmed = line.trim()
    if (isBrandLikeLine(trimmed)) return trimmed
  }
  return ''
}

// Brand names are usually the most visually prominent (tallest) text on a
// price tag — more reliable than "first line", which is often a store
// header, SKU, or barcode caption. Requires Tesseract's block/line geometry
// (recognize() called with `{ blocks: true }` in its output options).
function guessBrandFromBlocks(blocks) {
  if (!blocks) return ''
  const candidates = []
  for (const block of blocks) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const trimmed = (line.text || '').trim()
        if (!isBrandLikeLine(trimmed)) continue
        if (line.confidence < 40) continue
        const height = line.bbox ? line.bbox.y1 - line.bbox.y0 : 0
        candidates.push({ text: trimmed, height, confidence: line.confidence })
      }
    }
  }
  if (!candidates.length) return ''
  candidates.sort((a, b) => b.height - a.height || b.confidence - a.confidence)
  return candidates[0].text
}

export async function scanTag(blob) {
  const worker = await getWorker()
  const [{ data }, logoResult] = await Promise.all([
    worker.recognize(blob, {}, { text: true, blocks: true }),
    // Logo matching is a bonus signal — only recognizes brands in the
    // bundled reference set, and should never block the rest of OCR if it
    // fails (missing model, no confident match, etc).
    matchLogo(blob).catch(() => null),
  ])
  const text = data.text || ''
  const lines = text.split('\n').filter(Boolean)

  const categoryHint = guessCategory(text)
  const textColor = guessColorFromText(text)
  let imageColor = ''
  if (!textColor) {
    try {
      imageColor = await dominantColorName(blob)
    } catch {
      // image-based color is a bonus signal, not required
    }
  }

  // A confident logo match beats the text heuristics — it's reading the
  // actual mark, not guessing from font size — but only for brands it
  // actually knows; otherwise fall back to the OCR-text-based guess.
  const brand = logoResult?.brand || guessBrandFromBlocks(data.blocks) || guessBrandFromLines(lines)

  return {
    brand,
    brandSource: logoResult?.brand ? 'logo' : 'text',
    price: guessPrice(text),
    size: guessSize(text),
    category: categoryHint?.category || '',
    subcategory: categoryHint?.subcategory || '',
    color: textColor || imageColor,
    rawText: text.trim(),
  }
}
