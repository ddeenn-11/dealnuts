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
    label: 'Bags',
    subcategories: ['Handbags', 'Backpacks', 'Totes', 'Wallets & small goods', 'Other bags'],
  },
  {
    value: 'accessories',
    label: 'Accessories',
    subcategories: ['Jewelry', 'Belts', 'Hats', 'Scarves', 'Sunglasses', 'Other accessories'],
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
    subcategories: ['Audio', 'Wearables', 'Phones & tablets', 'Computers & accessories', 'Cameras', 'Other electronics'],
  },
  {
    value: 'food',
    label: 'Food',
    subcategories: ['Snacks', 'Beverages', 'Specialty & gourmet', 'Supplements', 'Other food'],
  },
  {
    value: 'babies',
    label: 'Babies',
    subcategories: ['Clothing', 'Toys', 'Feeding', 'Gear', 'Other baby'],
  },
  {
    value: 'entertainment',
    label: 'Entertainment',
    subcategories: ['Toys & games', 'Books', 'Collectibles', 'Media', 'Other entertainment'],
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
