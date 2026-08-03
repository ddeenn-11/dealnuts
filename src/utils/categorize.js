import { CATEGORIES } from './grouping.js'

// Keyword -> subcategory label, per category. Tag text almost never says the
// taxonomy word itself ("Outerwear") — it says the product word ("jacket").
// Keys are matched as lowercase substrings of the OCR'd text.
const EXTRA_KEYWORDS = {
  clothing: {
    shirt: 'Tops', tee: 'Tops', 't-shirt': 'Tops', blouse: 'Tops', top: 'Tops',
    sweater: 'Tops', sweatshirt: 'Tops', hoodie: 'Tops', cardigan: 'Tops', polo: 'Tops',
    jacket: 'Outerwear', coat: 'Outerwear', blazer: 'Outerwear', vest: 'Outerwear', parka: 'Outerwear',
    dress: 'Dresses', jumpsuit: 'Dresses', romper: 'Dresses', gown: 'Dresses',
    jeans: 'Bottoms', pants: 'Bottoms', trousers: 'Bottoms', shorts: 'Bottoms', skirt: 'Bottoms',
    leggings: 'Activewear', joggers: 'Activewear', tracksuit: 'Activewear',
  },
  shoes: {
    sneaker: 'Sneakers', sneakers: 'Sneakers', trainer: 'Sneakers', trainers: 'Sneakers', runner: 'Sneakers',
    boot: 'Boots', boots: 'Boots', bootie: 'Boots', booties: 'Boots',
    heel: 'Heels', heels: 'Heels', pump: 'Heels', pumps: 'Heels', stiletto: 'Heels',
    sandal: 'Sandals', sandals: 'Sandals', 'flip-flop': 'Sandals',
    flat: 'Flats', flats: 'Flats', loafer: 'Flats', loafers: 'Flats',
  },
  bags: {
    handbag: 'Handbags', purse: 'Handbags', clutch: 'Handbags', satchel: 'Handbags',
    backpack: 'Backpacks', rucksack: 'Backpacks',
    tote: 'Totes',
    wallet: 'Wallets & small goods', cardholder: 'Wallets & small goods', pouch: 'Wallets & small goods',
    crossbody: 'Handbags', messenger: 'Handbags',
  },
  accessories: {
    necklace: 'Jewelry', bracelet: 'Jewelry', earring: 'Jewelry', earrings: 'Jewelry', ring: 'Jewelry', pendant: 'Jewelry',
    belt: 'Belts',
    hat: 'Hats', cap: 'Hats', beanie: 'Hats', fedora: 'Hats',
    scarf: 'Scarves',
    sunglasses: 'Sunglasses', shades: 'Sunglasses',
  },
  home: {
    mug: 'Kitchen & dining', plate: 'Kitchen & dining', bowl: 'Kitchen & dining', glassware: 'Kitchen & dining', cutlery: 'Kitchen & dining',
    vase: 'Decor', candle: 'Decor', frame: 'Decor', artwork: 'Decor',
    pillow: 'Bedding & bath', cushion: 'Bedding & bath', blanket: 'Bedding & bath', towel: 'Bedding & bath', sheet: 'Bedding & bath',
    basket: 'Storage & organization', organizer: 'Storage & organization', bin: 'Storage & organization',
    lamp: 'Furniture', chair: 'Furniture', table: 'Furniture', shelf: 'Furniture',
  },
  beauty: {
    serum: 'Skincare', moisturizer: 'Skincare', cleanser: 'Skincare', sunscreen: 'Skincare', toner: 'Skincare',
    lipstick: 'Makeup', foundation: 'Makeup', mascara: 'Makeup', blush: 'Makeup', eyeshadow: 'Makeup',
    shampoo: 'Haircare', conditioner: 'Haircare',
    perfume: 'Fragrance', cologne: 'Fragrance', fragrance: 'Fragrance',
    brush: 'Tools & accessories', applicator: 'Tools & accessories',
  },
  outdoors: {
    tent: 'Camping & hiking', 'sleeping bag': 'Camping & hiking', hiking: 'Camping & hiking',
    jersey: 'Sportswear', legging: 'Sportswear',
    bike: 'Cycling', cycling: 'Cycling', helmet: 'Cycling',
    kayak: 'Water sports', wetsuit: 'Water sports', paddle: 'Water sports',
    binoculars: 'Equipment', cooler: 'Equipment',
  },
  electronics: {
    headphone: 'Audio', headphones: 'Audio', earbud: 'Audio', earbuds: 'Audio', speaker: 'Audio',
    smartwatch: 'Wearables', fitness: 'Wearables',
    phone: 'Phones & tablets', tablet: 'Phones & tablets',
    laptop: 'Computers & accessories', keyboard: 'Computers & accessories', mouse: 'Computers & accessories', charger: 'Computers & accessories', cable: 'Computers & accessories',
    camera: 'Cameras', lens: 'Cameras',
  },
  food: {
    snack: 'Snacks', chips: 'Snacks', chocolate: 'Snacks', candy: 'Snacks', cookie: 'Snacks', cookies: 'Snacks',
    tea: 'Beverages', coffee: 'Beverages', juice: 'Beverages', soda: 'Beverages',
    gourmet: 'Specialty & gourmet', artisan: 'Specialty & gourmet',
    vitamin: 'Supplements', supplement: 'Supplements', protein: 'Supplements',
  },
  babies: {
    onesie: 'Clothing', bib: 'Clothing',
    rattle: 'Toys', plush: 'Toys',
    bottle: 'Feeding', pacifier: 'Feeding',
    stroller: 'Gear', crib: 'Gear', carrier: 'Gear',
  },
  entertainment: {
    puzzle: 'Toys & games', 'board game': 'Toys & games', figure: 'Toys & games', figurine: 'Toys & games',
    book: 'Books', novel: 'Books',
    collectible: 'Collectibles', 'trading card': 'Collectibles',
    vinyl: 'Media', album: 'Media', 'blu-ray': 'Media',
  },
}

// Returns { category, subcategory } for the longest keyword match found in
// the text (longer matches are treated as more specific/confident), or null
// if nothing matched. This is a hint to prefill the form with, not a
// classification the user can't override.
export function guessCategory(text) {
  const lower = text.toLowerCase()
  let best = null

  for (const cat of CATEGORIES) {
    const keywordMap = EXTRA_KEYWORDS[cat.value] || {}
    const candidates = [
      ...(cat.subcategories || []).map((s) => [s.toLowerCase(), s]),
      ...Object.entries(keywordMap),
    ]
    for (const [keyword, subcategory] of candidates) {
      if (keyword.length < 3) continue
      if (lower.includes(keyword)) {
        if (!best || keyword.length > best.matchLength) {
          best = { category: cat.value, subcategory, matchLength: keyword.length }
        }
      }
    }
  }

  return best ? { category: best.category, subcategory: best.subcategory } : null
}
