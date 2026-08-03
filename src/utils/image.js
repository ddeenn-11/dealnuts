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
// when the tag text doesn't spell out a color name. Downsamples a *center
// crop* of the photo (the product is usually framed in the middle; the
// background/table/shadow is usually at the edges) to a small grid and
// buckets each pixel to the nearest named color, then returns the most
// frequent bucket (more robust than averaging RGB, which washes mixed
// shading out to a muddy gray). Only near-white and near-black pixels are
// excluded — earlier this also excluded every low-saturation midtone to
// keep gray backgrounds from dominating the count, but that band is exactly
// where Gray/Charcoal/Silver live, so a plain gray product could never be
// detected. Cropping to the center is what actually keeps background out
// now, so true grays are countable again.
export function dominantColorName(blob, sampleSize = 48, cropFraction = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(blob)

    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width
        const srcH = img.naturalHeight || img.height
        const cropW = srcW * cropFraction
        const cropH = srcH * cropFraction
        const sx = (srcW - cropW) / 2
        const sy = (srcH - cropH) / 2

        const canvas = document.createElement('canvas')
        canvas.width = sampleSize
        canvas.height = sampleSize
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, sampleSize, sampleSize)
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
