// Best-effort, fully on-device tag scanning via Tesseract.js. Runs in the
// browser — no photo ever leaves the device. Accuracy on stylized price-tag
// fonts is inherently limited, so results are hints to prefill fields with,
// never auto-saved without the user seeing them first.

import { guessCategory } from './categorize.js'
import { guessColorFromText } from './colors.js'
import { dominantColorName } from './image.js'
import { BRAND_CATEGORIES } from './brands.js'

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

// Tesseract's WASM binary + language data only download/initialize once,
// on whatever call to getWorker() happens first — normally the first
// photo the user takes, which puts that cold-start cost right in the
// middle of their wait. Called on AddEntry mount instead, so it's already
// warm (or warming) by the time there's a photo to scan.
export function preloadOcrWorker() {
  getWorker().catch(() => {
    // Best-effort warmup — a failure here just means the first real scan
    // pays the init cost itself, same as before this existed.
  })
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
    return await worker.recognize(blob, {}, { text: true })
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: psmModule.AUTO })
  }
}

// Reused wherever we need to recognize an explicit 3-letter currency code
// next to a number: price extraction, and ruling out a currency-coded
// number as a size candidate below.
const CURRENCY_CODES = 'USD|HKD|EUR|GBP|CNY|RMB|JPY|KRW|TWD|THB|SGD|CAD|AUD|NZD|CHF'

const SIZE_WORD_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL)\b/i
// A bare 1-2 digit number is only accepted as a size when it's not part of
// something else that also looks like a short number: a thousands-grouped
// price ("1,080"), a decimal price ("12.99"), another digit run (a barcode
// fragment), a discount badge ("49折", "49% off"), or a currency-marked
// price — a symbol directly before it ("$42") or an ISO code directly
// before/after it ("USD 25", "170 HKD"). All of those are numbers a price
// tag carries that are never a size, so excluding them here (rather than
// skipping the whole line when a price is anywhere on it) means a size
// printed on the same line as a price ("PRICE $178  SIZE 8") still gets
// found. A real half-size like "9.5" is still fine, since nothing
// precedes or follows it in any of those ways.
const SIZE_NUMBER_TOKEN = new RegExp(
  `(?<![$£€¥₩฿]\\s?)(?<!(?:${CURRENCY_CODES})\\s?)\\b([0-9]{1,2}(?:\\.5)?)\\b(?![,.]\\s?[0-9]|\\s?[%折]|\\s?(?:${CURRENCY_CODES})\\b)`,
  'i'
)

// Shared amount shape: either a proper comma-grouped number ("1,080",
// "12,345") or a plain run of digits with no cap on length — JPY/KRW
// prices are routinely 4+ digits with no thousands separator at all
// ("¥15000"), and a {1,3} digit cap on the leading group would silently
// truncate those to their first 3 digits.
const AMOUNT = '(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]{2})?'

// Maps a currency marker to our supported ISO codes. Checked
// most-unambiguous-first: an explicit printed code ("USD") or a
// letter-prefixed dollar sign ("HK$") is unambiguous, so those win over a
// bare symbol. ¥ and a bare $ are inherently ambiguous — ¥ could be JPY or
// CNY, $ could be any of several dollar-currencies — so each falls back to
// one fixed default (JPY and HKD respectively) rather than guessing
// between options; it's a prefilled dropdown either way, one tap to
// correct. R$ (Brazilian Real) is accepted as a price prefix below but has
// no mapping here since BRL isn't one of our 14 supported currencies.
function symbolToCurrency(marker) {
  switch (marker) {
    case 'US$':
      return 'USD'
    case 'HK$':
      return 'HKD'
    case 'NT$':
      return 'TWD'
    case 'NZ$':
      return 'NZD'
    case 'S$':
      return 'SGD'
    case 'C$':
      return 'CAD'
    case 'A$':
      return 'AUD'
    case '₩':
      return 'KRW'
    case '฿':
      return 'THB'
    case '£':
      return 'GBP'
    case '€':
      return 'EUR'
    case '¥':
      return 'JPY'
    case '$':
      return 'HKD'
    default:
      return ''
  }
}

const CURRENCY_CODE_SET = new Set(CURRENCY_CODES.split('|'))

function codeToCurrency(code) {
  const upper = code.toUpperCase()
  if (upper === 'RMB') return 'CNY'
  return CURRENCY_CODE_SET.has(upper) ? upper : ''
}

// Ordered most-specific-first: an explicit currency mark wins over a bare
// decimal number, since tags often print a second unrelated decimal (a SKU
// fragment, a size like "10.5") that isn't the price. Decimals are
// optional throughout — plenty of real tags print whole-number prices
// ("HK$1,080") with no cents.
//
// Price and currency are read together, off the same match, rather than
// as two independent scans of the whole text. They used to be separate:
// guessPrice() found the amount, and a standalone guessCurrency() scanned
// the entire OCR'd text for any currency symbol/code, anywhere. On a busy
// tag, Tesseract can hallucinate a single stray symbol out of unrelated
// image noise (a logo, an icon) — and that alone was enough to make a
// whole-document scan report the wrong currency even when an actual,
// legible "$" sat right next to the price on the same line. Anchoring
// currency to whichever match found the price closes that off: a
// document-wide scan can no longer outrank the marker actually attached
// to the number being used.
function guessPriceAndCurrency(text) {
  let m = text.match(new RegExp(`(US\\$|HK\\$|R\\$|C\\$|A\\$|NT\\$|NZ\\$|S\\$|\\$|£|€|¥|₩|฿)\\s?(${AMOUNT})`)) // $12.99, HK$1,299, ¥15000
  if (m) return { price: m[2].replace(/,/g, ''), currency: symbolToCurrency(m[1]) }

  m = text.match(new RegExp(`\\b(S)\\s?(${AMOUNT})\\b`)) // OCR often misreads "$" as "S"
  if (m) return { price: m[2].replace(/,/g, ''), currency: 'HKD' }

  m = text.match(new RegExp(`\\b(${CURRENCY_CODES})\\s?(${AMOUNT})\\b`, 'i')) // "THB 590", "KRW 15,000" — code before amount
  if (m) return { price: m[2].replace(/,/g, ''), currency: codeToCurrency(m[1]) }

  m = text.match(new RegExp(`\\b(${AMOUNT})\\s?(${CURRENCY_CODES})\\b`, 'i')) // "29.99 USD" — amount before code
  if (m) return { price: m[1].replace(/,/g, ''), currency: codeToCurrency(m[2]) }

  // Bare decimal fallback — requires exactly 2 decimals (no currency
  // marker attached), so it won't grab a "9.5" size or a bare SKU number.
  // No marker means no currency signal from this match.
  m = text.match(/\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\b/)
  if (m) return { price: m[1].replace(/,/g, ''), currency: '' }

  return { price: '', currency: '' }
}

// Last resort, only when the price match above carried no currency marker
// of its own (or no price was found at all): the tag might still print a
// standalone currency code separately from the amount ("Price in THB").
// Deliberately code-only, never symbol-only — a specific 3-letter
// uppercase word is far less likely to be an OCR hallucination than a
// single stray symbol character, which is exactly what a full-text symbol
// scan got wrong above.
function guessStandaloneCurrencyCode(text) {
  const match = text.match(new RegExp(`\\b(${CURRENCY_CODES})\\b`, 'i'))
  return match ? codeToCurrency(match[1]) : ''
}

// A bare number is a weak, easily-confused signal (list markers, barcode
// fragments, an unrelated number in a title) — an explicit size word is
// checked first, across the whole text, regardless of where it sits. Only
// if nothing like that exists do we fall back to a numeric candidate, and
// only from lines that aren't themselves a numbered list item ("1. This
// shirt's destination?") or a barcode/SKU digit run (e.g.
// "1 93659 43142 1" — all digits and whitespace, way more of them than
// any real size uses). A price sharing the line is handled by
// SIZE_NUMBER_TOKEN itself, not by skipping the line.
function guessSize(text) {
  const wordMatch = text.match(SIZE_WORD_TOKEN)
  if (wordMatch) return wordMatch[1].toUpperCase()

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^[0-9]{1,2}[.)]\s/.test(trimmed)) continue
    if (/^[0-9\s]+$/.test(trimmed) && trimmed.replace(/\s/g, '').length > 3) continue
    const match = trimmed.match(SIZE_NUMBER_TOKEN)
    if (match) return match[1].toUpperCase()
  }
  return ''
}

// Weight/volume printed on beauty and grocery tags — "50ml", "500g",
// "6-pack" — a different signal from guessSize() above: those categories'
// tags print a physical quantity, not a garment size. Unit-anchored (the
// number must be directly followed by a known unit word), so this doesn't
// compete with price or size parsing, which never have a unit suffix like
// this. Covers the standard retail volume units (ml, cl, dl, l, fl oz, pt,
// gal) and weight units (mg, g, kg, oz, lb). The trailing \b on the whole
// unit group is what actually keeps single-letter units safe against
// their own longer relatives sharing a first character (e.g. "5gal" can't
// wrongly match bare "g" — that'd need a boundary right after the "g", but
// "a" follows it — so it falls through to "gal" instead); listing longer
// forms first is just for readability, not correctness.
const QUANTITY_PATTERN =
  /\b([0-9]+(?:\.[0-9]+)?)\s?(fl\s?\.?\s?oz|floz|ml|cl|dl|l|kg|mg|g|lbs?|oz|pt|gal)\b|\b([0-9]+)[\s-]?(pack|pcs|ct|count)\b/i

function guessQuantity(text) {
  const match = text.match(QUANTITY_PATTERN)
  if (!match) return ''
  if (match[1] && match[2]) return `${match[1]}${match[2].replace(/\s+/g, ' ').trim()}`
  return `${match[3]}-${match[4].toLowerCase()}`
}

// Brand is now a closed-vocabulary lookup, not a heuristic guess. The old
// approach (tallest/first letters-only line) confidently returned garbage
// as often as it returned a real brand — a marketing tagline, a section
// header ("WOMEN"), a barcode fragment misread as text. Only ever
// returning a name that's actually in our own brand list trades recall
// for precision: a brand that isn't in the list yet won't be picked up,
// but nothing gets invented. Matching is on normalized (lowercased,
// accent-stripped, punctuation-stripped) whole-word tokens, so "MAX&Co."
// matches "max co" regardless of exact punctuation/spacing, "ESTEE
// LAUDER" (how it's actually printed on most tags) matches our "Estée
// Lauder" entry, and it doesn't false-positive on a brand name that's
// merely a substring of an unrelated word (e.g. "Nike" inside
// "Nikeisha").
function normalizeBrandText(s) {
  const noAccents = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return ` ${noAccents.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

const KNOWN_BRANDS = Object.keys(BRAND_CATEGORIES)
  .map((name) => ({ name, needle: normalizeBrandText(name) }))
  // Longest normalized name first, so a more specific match (e.g. "Kate
  // Spade New York") is found before any shorter, less specific one.
  .sort((a, b) => b.needle.length - a.needle.length)

function guessKnownBrand(text) {
  const haystack = normalizeBrandText(text)
  for (const { name, needle } of KNOWN_BRANDS) {
    if (needle.length > 2 && haystack.includes(needle)) return name
  }
  return ''
}

export async function scanTag(blob) {
  const worker = await getWorker()
  const { data } = await worker.recognize(blob, {}, { text: true })
  let text = data.text || ''

  let size = guessSize(text)
  let textColor = guessColorFromText(text)
  let quantity = guessQuantity(text)

  // Second pass, only when the first left something on the table — see
  // recognizeSparse() for why this isn't just always-on.
  if (!size || !textColor || !quantity) {
    try {
      const sparse = await recognizeSparse(worker, blob)
      const sparseText = sparse.data.text || ''
      if (!size) size = guessSize(sparseText)
      if (!textColor) textColor = guessColorFromText(sparseText)
      if (!quantity) quantity = guessQuantity(sparseText)
      // Merge rather than replace — brand/price/currency below should
      // still get first crack at whichever pass actually found them.
      text = `${text}\n${sparseText}`
    } catch {
      // The extra pass is a bonus attempt — fall back to what pass one found
    }
  }

  const brand = guessKnownBrand(text)
  let categoryHint = guessCategory(text)

  // Keyword matching (guessCategory) only catches a category when the tag
  // spells out an ordinary product word — "moisturizer", "serum". Luxury
  // and designer product copy routinely doesn't ("Supercharged Gel-Creme
  // Synchronized Multi-Recovery" for what is, plainly, a beauty product),
  // and no keyword list will ever keep up with marketing language. When
  // keywords found nothing but the brand itself was recognized, fall back
  // to that brand's own category — but only when BRAND_CATEGORIES maps it
  // to exactly one category; a brand spanning several (e.g. Adidas: shoes
  // and clothing) is genuinely ambiguous, and guessing wrong here would be
  // worse than leaving category on its default.
  if (!categoryHint && brand) {
    const brandCategories = BRAND_CATEGORIES[brand]
    if (brandCategories?.length === 1) {
      categoryHint = { category: brandCategories[0], subcategory: '' }
    }
  }

  let imageColor = ''
  if (!textColor) {
    try {
      imageColor = await dominantColorName(blob)
    } catch {
      // image-based color is a bonus signal, not required
    }
  }

  const { price, currency: anchoredCurrency } = guessPriceAndCurrency(text)
  const currency = anchoredCurrency || guessStandaloneCurrencyCode(text)

  return {
    brand,
    price,
    currency,
    size,
    quantity,
    category: categoryHint?.category || '',
    subcategory: categoryHint?.subcategory || '',
    color: textColor || imageColor,
    rawText: text.trim(),
  }
}
