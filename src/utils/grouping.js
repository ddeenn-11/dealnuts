// Groups are keyed by category + subcategory (brand is not part of the
// grouping — items within a group can span any number of brands). If
// subcategory is blank, entries fall back to a category-only group rather
// than creating an empty-looking label.
export function groupKeyFor(entry) {
  const category = (entry.category || 'other').trim().toLowerCase()
  const subcategory = (entry.subcategory || '').trim().toLowerCase()
  return subcategory ? `${category}__${subcategory}` : category
}

export function groupLabelFor(entry) {
  const category = entry.category || 'other'
  const subcategory = (entry.subcategory || '').trim()
  const prettyCategory = categoryLabel(category)
  return subcategory ? `${prettyCategory} — ${subcategory}` : prettyCategory
}

function categorySortIndex(value) {
  const idx = CATEGORIES.findIndex((c) => c.value === (value || 'other').toLowerCase())
  return idx === -1 ? CATEGORIES.length : idx
}

function subcategorySortIndex(categoryValue, subcategory) {
  if (!subcategory) return -1
  const subs = subcategoriesFor(categoryValue)
  const idx = subs.findIndex((s) => s.toLowerCase() === subcategory.toLowerCase())
  return idx === -1 ? subs.length : idx
}

// Groups are ordered by category, then subcategory, following the taxonomy
// order (not by how many items are in each group). Entries within a group
// keep whatever order they arrive in — callers pass entries newest-first.
export function autoGroupEntries(entries) {
  const map = new Map()
  for (const entry of entries) {
    const key = groupKeyFor(entry)
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: groupLabelFor(entry),
        category: entry.category || 'other',
        subcategory: (entry.subcategory || '').trim(),
        entries: [],
      })
    }
    map.get(key).entries.push(entry)
  }
  return Array.from(map.values()).sort((a, b) => {
    const catDiff = categorySortIndex(a.category) - categorySortIndex(b.category)
    if (catDiff !== 0) return catDiff
    return subcategorySortIndex(a.category, a.subcategory) - subcategorySortIndex(b.category, b.subcategory)
  })
}

export const CATEGORIES = [
  {
    value: 'clothing',
    label: 'Clothing',
    subcategories: ['Tops', 'Bottoms', 'Outerwear', 'Dresses', 'Activewear', 'Other clothing'],
  },
  {
    value: 'shoes',
    label: 'Shoes',
    subcategories: ['Sneakers', 'Boots', 'Heels', 'Sandals', 'Flats', 'Other shoes'],
  },
  {
    value: 'bags',
    label: 'Bags & Luggage',
    subcategories: ['Handbags', 'Backpacks', 'Totes', 'Wallets & small goods', 'Luggage', 'Other bags'],
  },
  {
    value: 'accessories',
    label: 'Accessories',
    subcategories: ['Jewelry', 'Belts', 'Hats', 'Scarves', 'Sunglasses', 'Other accessories'],
  },
  {
    value: 'luxury',
    label: 'Luxury',
    subcategories: [],
  },
  {
    value: 'home',
    label: 'Home',
    subcategories: ['Furniture', 'Kitchen & dining', 'Decor', 'Bedding & bath', 'Storage & organization', 'Other home'],
  },
  {
    value: 'beauty',
    label: 'Beauty',
    subcategories: ['Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Tools & accessories', 'Other beauty'],
  },
  {
    value: 'outdoors',
    label: 'Outdoors',
    subcategories: ['Camping & hiking', 'Sportswear', 'Cycling', 'Water sports', 'Equipment', 'Other outdoors'],
  },
  {
    value: 'electronics',
    label: 'Electronics',
    subcategories: ['Audio', 'Wearables', 'Watches', 'Phones & tablets', 'Computers & accessories', 'Cameras', 'Other electronics'],
  },
  {
    value: 'kids',
    label: 'Kids',
    subcategories: ['Clothing', 'Toys', 'Feeding', 'Gear', 'Other kids'],
  },
  {
    value: 'other',
    label: 'Other',
    subcategories: [],
  },
]

export const CATEGORY_OPTIONS = CATEGORIES.map((c) => c.value)

export function categoryLabel(value) {
  return CATEGORIES.find((c) => c.value === value)?.label || value
}

export function subcategoriesFor(value) {
  return CATEGORIES.find((c) => c.value === value)?.subcategories || []
}

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
