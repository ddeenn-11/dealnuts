// Best-effort, fully on-device tag scanning via Tesseract.js. Runs in the
// browser — no photo ever leaves the device. Accuracy on stylized price-tag
// fonts is inherently limited, so results are hints to prefill fields with,
// never auto-saved without the user seeing them first.

let workerPromise = null

function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'))
  }
  return workerPromise
}

const SIZE_TOKEN = /\b(XXS|XS|S|M|L|XL|XXL|XXXL|[0-9]{1,2}(?:\.5)?)\b/i
const PRICE_TOKEN = /\$\s?([0-9]{1,5}(?:\.[0-9]{2})?)/

// Heuristic: the first short, letters-only line that isn't a price or size
// token is guessed as the brand. Frequently wrong — it's a starting point
// for the user to correct, not an authoritative read.
function guessBrand(lines) {
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 24) continue
    if (PRICE_TOKEN.test(trimmed) || /^[0-9.,\s]+$/.test(trimmed)) continue
    if (/^[A-Za-z][A-Za-z&'.\s-]*$/.test(trimmed)) return trimmed
  }
  return ''
}

function guessPrice(text) {
  const match = text.match(PRICE_TOKEN)
  return match ? match[1] : ''
}

function guessSize(text) {
  const match = text.match(SIZE_TOKEN)
  return match ? match[1].toUpperCase() : ''
}

export async function scanTag(blob) {
  const worker = await getWorker()
  const {
    data: { text },
  } = await worker.recognize(blob)
  const lines = text.split('\n').filter(Boolean)
  return {
    brand: guessBrand(lines),
    price: guessPrice(text),
    size: guessSize(text),
    rawText: text.trim(),
  }
}
