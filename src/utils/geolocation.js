export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
      },
      (err) => {
        reject(err)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

const LANDMARK_RADIUS_METERS = 300
const LOOKUP_TIMEOUT_MS = 6000

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Reverse geocoding at a single point (see reverseGeocode below) resolves to
// whatever address unit exactly contains that point — often a street name
// or an unnamed building, since the specific shop unit someone's standing
// in usually isn't individually mapped. What's actually useful as a
// "Location" while shopping is the nearest recognizable place — a mall,
// department store, or retail complex — which is a *search nearby*
// question, not a reverse-geocode-this-exact-point one. Queried via
// Overpass (OpenStreetMap's free query API) for named shopping landmarks
// within range, picking whichever is physically closest.
async function nearestShoppingLandmark(latitude, longitude) {
  // Deliberately narrow to genuinely prominent shopping landmarks (malls,
  // department stores, shopping centres) — a broader tag like
  // landuse=retail or building=retail matches literally any named small
  // shop, which defeats the point (a pawn shop isn't a "landmark").
  const query = `[out:json][timeout:8];(
    node["shop"="mall"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    way["shop"="mall"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    node["shop"="department_store"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    way["shop"="department_store"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    node["amenity"="marketplace"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    way["amenity"="marketplace"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
    way["building"="mall"](around:${LANDMARK_RADIUS_METERS},${latitude},${longitude});
  );out center 10;`

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
  if (!res.ok) return ''
  const data = await res.json()

  let best = ''
  let bestDist = Infinity
  for (const el of data.elements || []) {
    const name = el.tags?.['name:en'] || el.tags?.name
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (!name || lat == null || lon == null) continue
    const dist = haversineMeters(latitude, longitude, lat, lon)
    if (dist < bestDist) {
      bestDist = dist
      best = name
    }
  }
  return best
}

// Fallback for when no shopping landmark is nearby: resolve whatever
// address unit actually contains this exact point, via OpenStreetMap's
// free Nominatim service.
async function reverseGeocodeAddress(latitude, longitude) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
    { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) }
  )
  if (!res.ok) return ''
  const data = await res.json()
  if (data.name) return data.name
  const addr = data.address || {}
  return addr.shop || addr.building || addr.road || (data.display_name || '').split(',')[0] || ''
}

// Best-effort location name for a GPS fix. Tries the nearest named shopping
// landmark first (see nearestShoppingLandmark) since that's what's actually
// useful while logging a find, falling back to a plain address lookup if
// nothing notable is nearby. If both fail or are rate-limited, we just
// leave the store name blank for the person to fill in themselves — never
// block saving an entry on this.
export async function reverseGeocode(latitude, longitude) {
  try {
    const landmark = await nearestShoppingLandmark(latitude, longitude)
    if (landmark) return landmark
  } catch {
    // fall through to the address-based lookup below
  }
  try {
    return await reverseGeocodeAddress(latitude, longitude)
  } catch {
    return ''
  }
}

export function mapLinkFor(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
