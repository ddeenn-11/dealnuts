import { nearestColorName } from './colors.js'

// Resizes and compresses a captured photo before it goes into IndexedDB,
// so a session of browsing many stores doesn't balloon storage size.
export function compressImage(file, maxDimension = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      let { width, height } = img

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(objectUrl)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Could not process that photo.'))
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read that photo.'))
    }

    img.src = objectUrl
  })
}

// Best-effort dominant color, sampled straight from pixels — a fallback for
// when the tag text doesn't spell out a color name. Downsamples to a small
// grid and buckets each pixel to the nearest named color, then returns the
// most frequent bucket (more robust than averaging RGB, which washes mixed
// shading out to a muddy gray). Background paper/shadow pixels (near-white,
// near-black, or low-saturation midtones) are excluded from the count —
// this trades away true grays/silvers being detected reliably in exchange
// for not letting the tag background dominate the guess.
export function dominantColorName(blob, sampleSize = 48) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(blob)

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = sampleSize
        canvas.height = sampleSize
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize)
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)

        const counts = new Map()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const alpha = data[i + 3]
          if (alpha < 200) continue

          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          if (max > 232 && min > 195) continue // near-white background
          if (max < 30) continue // near-black shadow
          if (max - min < 12 && max > 60 && max < 200) continue // low-saturation gray

          const name = nearestColorName([r, g, b])
          counts.set(name, (counts.get(name) || 0) + 1)
        }

        URL.revokeObjectURL(objectUrl)

        let best = ''
        let bestCount = 0
        for (const [name, count] of counts) {
          if (count > bestCount) {
            best = name
            bestCount = count
          }
        }
        resolve(best)
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
