// A curated palette of common apparel/product color names, each with a
// reference RGB. Used two ways: matching color words that appear in OCR'd
// tag text, and finding the nearest name to a sampled pixel color from the
// product photo. Not exhaustive — picks the closest common name over a
// precise one (e.g. "Blue" rather than "Cerulean").
export const NAMED_COLORS = [
  { name: 'Black', rgb: [17, 17, 17] },
  { name: 'White', rgb: [245, 245, 245] },
  { name: 'Gray', rgb: [128, 128, 128] },
  { name: 'Charcoal', rgb: [54, 58, 63] },
  { name: 'Beige', rgb: [222, 202, 173] },
  { name: 'Tan', rgb: [210, 180, 140] },
  { name: 'Camel', rgb: [193, 154, 107] },
  { name: 'Cream', rgb: [255, 253, 208] },
  { name: 'Ivory', rgb: [255, 255, 240] },
  { name: 'Brown', rgb: [101, 67, 33] },
  { name: 'Red', rgb: [200, 30, 30] },
  { name: 'Maroon', rgb: [128, 0, 0] },
  { name: 'Burgundy', rgb: [128, 0, 32] },
  { name: 'Pink', rgb: [255, 182, 193] },
  { name: 'Orange', rgb: [230, 126, 34] },
  { name: 'Yellow', rgb: [240, 210, 40] },
  { name: 'Mustard', rgb: [200, 164, 46] },
  { name: 'Gold', rgb: [212, 175, 55] },
  { name: 'Green', rgb: [50, 130, 70] },
  { name: 'Olive', rgb: [107, 110, 60] },
  { name: 'Teal', rgb: [30, 130, 130] },
  { name: 'Blue', rgb: [40, 90, 190] },
  { name: 'Navy', rgb: [20, 30, 70] },
  { name: 'Sky Blue', rgb: [135, 206, 235] },
  { name: 'Purple', rgb: [120, 60, 160] },
  { name: 'Lavender', rgb: [180, 160, 220] },
  { name: 'Silver', rgb: [192, 192, 192] },
]

// Picks whichever named color occurs earliest in the text, not just the
// first one found in palette order. This matters for compound descriptions
// like "Olive Green Wool Coat" — the modifier ("Olive") precedes the base
// hue ("Green") and is the more specific, more correct read.
export function guessColorFromText(text) {
  const lower = text.toLowerCase()
  let best = null
  for (const { name } of NAMED_COLORS) {
    const idx = lower.indexOf(name.toLowerCase())
    if (idx === -1) continue
    if (!best || idx < best.idx || (idx === best.idx && name.length > best.name.length)) {
      best = { name, idx }
    }
  }
  return best ? best.name : ''
}

export function nearestColorName([r, g, b]) {
  let best = ''
  let bestDist = Infinity
  for (const c of NAMED_COLORS) {
    const [cr, cg, cb] = c.rgb
    const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = c.name
    }
  }
  return best
}
