// Best-effort, fully on-device tag scanning via Tesseract.js. Runs in the
// browser — no photo ever leaves the device. Accuracy on stylized price-tag
// fonts is inherently limited, so results are hints to prefill fields with,
// never auto-saved without the user seeing them first.

import { guessCategory } from './categorize.js'
import { guessColorFromText } from './colors.js'
import { dominantColorName } from './image.js'

let workerPromise = null
let psmModule = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker, PSM }) => {
      psmModule = PSM
      return createWorker('eng')
    })
  }
  return workerPromise
}

// Tesseract's default page segmentation mode (AUTO) assumes something
// close to a single flowing document. That's fine for a plain "$29.99"
// price line, but it falls apart on the rest of a real tag — a huge
// standalone size letter, or a short color word buried in fine print —
// where AUTO drops or garbles text that SPARSE_TEXT ("find as much text
// as possible, in no particular order") reads correctly. The reverse is
// also true: SPARSE_TEXT tends to fragment a busy full-photo capture
// (barcode bars split into garbled isolated "characters", a currency
// symbol dropped) worse than AUTO does. Rather than pick one globally, a
// second SPARSE_TEXT pass only runs when the first (AUTO) pass leaves
// color or size blank — the two cases it demonstrably recovers — so most
// scans pay for one recognition pass, not two.
async function recognizeSparse(worker, blob) {
  await worker.setParameters({ tessedit_pageseg_mode: psmModule.SPARSE_TEXT })
  try {
    return await worker.recognize(blob, {}, { text: true, blocks: true })
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: psmModule.AUTO })
  }
}

const SIZE_WORD_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/i
// A line that IS a size word, on its own, with nothing else on it — as
// opposed to SIZE_WORD_TOKEN above, which finds one anywhere inside a
// longer line.
const SIZE_WORD_ONLY = /^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i
// A bare 1-2 digit number is only accepted as a size when it's not part of
// something else that also looks like a short number: a thousands-grouped
// price ("1,080"), a decimal price ("12.99"), or another digit run (a
// barcode fragment). The lookahead blocks a match that's immediately
// followed by ",digit" or ".digit" — a real half-size like "9.5" is still
// fine, since nothing follows the ".5".
const SIZE_NUMBER_TOKEN = /\b([0-9]{1,2}(?:\.5)?)\b(?![,.]\s?[0-9])/

// Shared amount shape: either a proper comma-grouped number ("1,080",
// "12,345") or a plain run of digits with no cap on length — JPY/KRW
// prices are routinely 4+ digits with no thousands separator at all
// ("¥15000"), and a {1,3} digit cap on the leading group would silently
// truncate those to their first 3 digits.
const AMOUNT = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{2})?'

// Ordered most-specific-first: an explicit currency mark wins over a bare
// decimal number, since tags often print a second unrelated decimal (a SKU
// fragment, a size like "10.5") that isn't the price. Decimals are
// optional throughout — plenty of real tags print whole-number prices
// ("HK$1,080") with no cents.
const PRICE_PATTERNS = [
  new RegExp(`(?:US\\$|HK\\$|R\\$|C\\$|A\\$|NT\\$|NZ\\$|S\\$|\\$|£|€|¥|₩|฿)\\s?(${AMOUNT})`), // $12.99, HK$1,299, ¥15000
  new RegExp(`\\bS\\s?(${AMOUNT})\\b`), // OCR often misreads "$" as "S"
  new RegExp(`\\b(?:USD|HKD|EUR|GBP|CNY|RMB|JPY|KRW|TWD|THB|SGD|CAD|AUD|NZD|CHF)\\s?(${AMOUNT})\\b`, 'i'), // "THB 590", "KRW 15,000" — code before amount
  new RegExp(`\\b(${AMOUNT})\\s?(?:USD|HKD|EUR|GBP|CNY|RMB|JPY|KRW|TWD|THB|SGD|CAD|AUD|NZD|CHF)\\b`, 'i'), // "29.99 USD" — amount before code
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

// Maps whatever currency mark shows up in the tag text to one of our 14
// supported ISO codes. Checked most-unambiguous-first: an explicit printed
// code ("USD") or a letter-prefixed dollar sign ("HK$") is unambiguous, so
// those win over a bare symbol. ¥ and a bare $ are inherently ambiguous —
// ¥ could be JPY or CNY, $ could be any of several dollar-currencies — so
// each falls back to one fixed default (JPY and HKD respectively) rather
// than guessing between options; it's a prefilled dropdown either way, one
// tap to correct.
const CURRENCY_MARKERS = [
  [/\bUSD\b/i, 'USD'],
  [/\bHKD\b/i, 'HKD'],
  [/\bCAD\b/i, 'CAD'],
  [/\bAUD\b/i, 'AUD'],
  [/\bGBP\b/i, 'GBP'],
  [/\bEUR\b/i, 'EUR'],
  [/\bCHF\b/i, 'CHF'],
  [/\bJPY\b/i, 'JPY'],
  [/\bKRW\b/i, 'KRW'],
  [/\bTWD\b/i, 'TWD'],
  [/\bTHB\b/i, 'THB'],
  [/\bSGD\b/i, 'SGD'],
  [/\bNZD\b/i, 'NZD'],
  [/\b(?:CNY|RMB)\b/i, 'CNY'],
  [/US\$/, 'USD'],
  [/HK\$/, 'HKD'],
  [/NT\$/, 'TWD'],
  [/NZ\$/, 'NZD'],
  [/\bS\$/, 'SGD'],
  [/\bC\$/, 'CAD'],
  [/\bA\$/, 'AUD'],
  [/₩/, 'KRW'],
  [/฿/, 'THB'],
  [/£/, 'GBP'],
  [/€/, 'EUR'],
  [/¥/, 'JPY'], // ambiguous with CNY — defaults to JPY
  [/\$/, 'HKD'], // ambiguous across several dollar-currencies — defaults to HKD
]

function guessCurrency(text) {
  for (const [pattern, iso] of CURRENCY_MARKERS) {
    if (pattern.test(text)) return iso
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
  // A standalone size letter ("L", "XL", "S"...) is often the single
  // biggest, boldest thing on a tag — exactly what the height heuristic
  // below is looking for — but no real brand is just "L" on its own.
  if (SIZE_WORD_ONLY.test(trimmed)) return false
  // A 1-2 character line is almost never a real brand, and is exactly
  // what a misread barcode/QR fragment looks like once OCR splits it off
  // as its own "line" — one that can inherit a deceptively tall bounding
  // box from the barcode bars behind it, winning the height heuristic
  // below despite being garbage.
  if (trimmed.replace(/[^A-Za-z0-9]/g, '').length < 3) return false
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
  const { data } = await worker.recognize(blob, {}, { text: true, blocks: true })
  let text = data.text || ''
  let blocks = data.blocks

  let size = guessSize(text)
  let textColor = guessColorFromText(text)

  // Second pass, only when the first left something on the table — see
  // recognizeSparse() for why this isn't just always-on.
  if (!size || !textColor) {
    try {
      const sparse = await recognizeSparse(worker, blob)
      const sparseText = sparse.data.text || ''
      if (!size) size = guessSize(sparseText)
      if (!textColor) textColor = guessColorFromText(sparseText)
      // Merge rather than replace — brand/price/currency below should
      // still get first crack at whichever pass actually found them.
      text = `${text}\n${sparseText}`
      blocks = data.blocks?.length ? data.blocks : sparse.data.blocks
    } catch {
      // The extra pass is a bonus attempt — fall back to what pass one found
    }
  }

  const lines = text.split('\n').filter(Boolean)
  const categoryHint = guessCategory(text)
  let imageColor = ''
  if (!textColor) {
    try {
      imageColor = await dominantColorName(blob)
    } catch {
      // image-based color is a bonus signal, not required
    }
  }

  const brand = guessBrandFromBlocks(blocks) || guessBrandFromLines(lines)

  return {
    brand,
    price: guessPrice(text),
    currency: guessCurrency(text),
    size,
    category: categoryHint?.category || '',
    subcategory: categoryHint?.subcategory || '',
    color: textColor || imageColor,
    rawText: text.trim(),
  }
}
