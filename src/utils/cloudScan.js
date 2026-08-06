// Cloud-assisted tag scanning: escalates to a hosted vision model when the
// local, fully on-device pass (ocr.js) leaves brand or price blank — the
// two fields local recognition struggles with most (see ocr.js's own
// comments). Unlike scanTag() in ocr.js, this sends the photo to a
// serverless relay (api/scan-tag.js), which is the one path in the app
// where a photo leaves the device.
//
// cloudScanTag() expects the blob it's given to already be scan-resolution
// (AddEntry.jsx passes the same ~1600px/0.9 JPEG it hands to local OCR) —
// there's no separate downscale step here anymore, since resizing it again
// to the same target would just be a wasted decode/re-encode.
import { CATEGORY_OPTIONS, subcategoriesFor } from './grouping.js'
import { CURRENCIES } from './currency.js'

// The prompt (api/scan-tag.js) asks Gemini for one of our ISO currency
// codes, but nothing enforces that — it sometimes echoes the symbol
// actually printed on the tag instead (e.g. "HK$" rather than "HKD").
// Mirrors the symbol -> code mapping local OCR's own symbolToCurrency()
// already trusts (ocr.js), so a technically-out-of-spec but unambiguous
// response still counts instead of being discarded outright by the plain
// enum check below.
const CURRENCY_ALIASES = {
  'HK$': 'HKD',
  'US$': 'USD',
  'NT$': 'TWD',
  'NZ$': 'NZD',
  'S$': 'SGD',
  'C$': 'CAD',
  'A$': 'AUD',
  '¥': 'JPY',
  '₩': 'KRW',
  '฿': 'THB',
  '£': 'GBP',
  '€': 'EUR',
  RMB: 'CNY',
}

function normalizeCurrency(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (CURRENCIES.includes(trimmed)) return trimmed
  return CURRENCY_ALIASES[trimmed] || ''
}

// Category/subcategory are also supposed to be constrained to our own
// enums by the prompt, but nothing guarantees a model actually stays
// inside them — an unrecognized value written straight into form state
// would silently desync the <select> from what's displayed. Validating
// here keeps cloudScanTag()'s contract the same as local scanTag(): a
// valid enum value, or empty.
function sanitizeHints(data) {
  const category = CATEGORY_OPTIONS.includes(data.category) ? data.category : ''
  const validSubcategories = category ? subcategoriesFor(category) : []
  const subcategory = validSubcategories.includes(data.subcategory) ? data.subcategory : ''
  const currency = normalizeCurrency(data.currency)
  return {
    brand: typeof data.brand === 'string' ? data.brand : '',
    price: typeof data.price === 'string' ? data.price : '',
    currency,
    category,
    subcategory,
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      // Strip the "data:image/jpeg;base64," prefix — the server only wants
      // the base64 payload itself.
      resolve(typeof result === 'string' ? result.split(',')[1] || '' : '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Returns { brand, price, currency, category, subcategory } (each '' if
// the model couldn't determine it), or null if the cloud call fails
// outright (network error, rate limited, server error). Never throws —
// same best-effort philosophy as the rest of tag scanning: a failed
// escalation just means the caller falls back to whatever local OCR found.
export async function cloudScanTag(blob) {
  try {
    const base64 = await blobToBase64(blob)
    if (!base64) return null

    const res = await fetch('/api/scan-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' }),
    })
    if (!res.ok) return null

    const data = await res.json()
    return sanitizeHints(data)
  } catch {
    return null
  }
}
