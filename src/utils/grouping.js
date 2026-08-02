// Groups are keyed by category + brand. If brand is blank, entries fall
// back to a category-only group rather than creating an empty-looking label.
export function groupKeyFor(entry) {
  const category = (entry.category || 'other').trim().toLowerCase()
  const brand = (entry.brand || '').trim().toLowerCase()
  return brand ? `${category}__${brand}` : category
}

export function groupLabelFor(entry) {
  const category = entry.category || 'other'
  const brand = (entry.brand || '').trim()
  const prettyCategory = category.charAt(0).toUpperCase() + category.slice(1)
  return brand ? `${prettyCategory} — ${brand}` : prettyCategory
}

export function autoGroupEntries(entries) {
  const map = new Map()
  for (const entry of entries) {
    const key = groupKeyFor(entry)
    if (!map.has(key)) {
      map.set(key, { key, label: groupLabelFor(entry), entries: [] })
    }
    map.get(key).entries.push(entry)
  }
  return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length)
}

export const CATEGORY_OPTIONS = [
  'clothing',
  'shoes',
  'bags',
  'accessories',
  'electronics',
  'other',
]

export function formatPrice(price) {
  if (price === '' || price === null || price === undefined) return '—'
  const num = Number(price)
  if (Number.isNaN(num)) return '—'
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDateTime(timestamp) {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
