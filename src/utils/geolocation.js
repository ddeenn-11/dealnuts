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

// Best-effort reverse geocoding using OpenStreetMap's free Nominatim service.
// If it fails or is rate-limited, we just leave the store name blank for the
// person to fill in themselves — never block saving an entry on this.
export async function reverseGeocode(latitude, longitude) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    )
    if (!res.ok) return ''
    const data = await res.json()
    if (data.name) return data.name
    const addr = data.address || {}
    return addr.shop || addr.building || addr.road || (data.display_name || '').split(',')[0] || ''
  } catch {
    return ''
  }
}

export function mapLinkFor(latitude, longitude) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
