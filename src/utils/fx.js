// Live exchange rates from open.er-api.com (free, no API key, updates daily).
// Cached in sessionStorage per base currency per day so switching screens
// doesn't re-fetch, and the app stays within the free tier's fair use.

const CACHE_PREFIX = 'buyright-fx-'

function todayKey(base) {
  return `${CACHE_PREFIX}${base}-${new Date().toISOString().slice(0, 10)}`
}

export async function fetchRates(base) {
  const cacheKey = todayKey(base)
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) return JSON.parse(cached)

  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!res.ok) throw new Error('Could not fetch exchange rates.')
  const data = await res.json()
  if (data.result !== 'success') throw new Error('Could not fetch exchange rates.')

  const result = { base, rates: data.rates, timestamp: data.time_last_update_utc }
  sessionStorage.setItem(cacheKey, JSON.stringify(result))
  return result
}

// rates are "units of X per 1 base"; converting an amount priced in
// `fromCurrency` into `rates.base` divides by that currency's rate.
export function convert(amount, fromCurrency, rates) {
  if (amount === null || amount === undefined || amount === '') return null
  const rate = rates[fromCurrency]
  if (!rate) return null
  return Number(amount) / rate
}
