// Cloud-assisted tag scanning: escalates to a hosted vision model when the
// local, fully on-device pass (ocr.js) leaves brand or price blank — the
// two fields local recognition struggles with most (see ocr.js's own
// comments). Unlike scanTag() in ocr.js, this sends the photo to a
// serverless relay (api/scan-tag.js), which is the one path in the app
// where a photo leaves the device.
import { CATEGORY_OPTIONS, subcategoriesFor } from './grouping.js'
import { CURRENCIES } from './currency.js'

// A separate, smaller copy of the photo than the one that gets stored —
// tag text stays legible well below the stored resolution, and image size
// is the main lever on cloud call cost.
const MAX_DIMENSION = 768
const JPEG_QUALITY = 0.7

function downscaleForCloud(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(blob)
    img.onload = () => {
      try {
        let { width, height } = img
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width)
            width = MAX_DIMENSION
          } else {
            width = Math.round((width * MAX_DIMENSION) / height)
            height = MAX_DIMENSION
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(objectUrl)
        canvas.toBlob(
          (out) => (out ? resolve(out) : reject(new Error('Could not downscale photo.'))),
          'image/jpeg',
          JPEG_QUALITY
        )
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that photo.'))
    }
    img.src = objectUrl
  })
}

// Category/subcategory/currency are supposed to be constrained to our own
// enums by the prompt (see api/scan-tag.js), but nothing guarantees a
// model actually stays inside them — an unrecognized value written
// straight into form state would silently desync the <select> from what's
// displayed. Validating here keeps cloudScanTag()'s contract the same as
// local scanTag(): a valid enum value, or empty.
function sanitizeHints(data) {
  const category = CATEGORY_OPTIONS.includes(data.category) ? data.category : ''
  const validSubcategories = category ? subcategoriesFor(category) : []
  const subcategory = validSubcategories.includes(data.subcategory) ? data.subcategory : ''
  const currency = CURRENCIES.includes(data.currency) ? data.currency : ''
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
    const smaller = await downscaleForCloud(blob)
    const base64 = await blobToBase64(smaller)
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
