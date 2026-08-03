// Shared shape-only preprocessing for logo matching. Converts an image to a
// white-background line-drawing of its edges (Sobel gradient magnitude) so
// the resulting MobileNet embedding is driven by the logo's outline, not
// its fill color — a red Nike swoosh and a black one produce nearly the
// same edges, since an edge is defined by local contrast against the
// background, not by which color is on which side of it.
//
// This MUST be used identically for both the live query photo and the
// reference logo set — comparing an outline embedding against a raw-color
// embedding is meaningless. See scripts/regen-embeddings for how the
// reference set (embeddings.json) is (re)generated with this same function.

function drawContainFit(ctx, img, size) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const scale = Math.min(size / srcW, size / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale
  const dx = (size - drawW) / 2
  const dy = (size - drawH) / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, dx, dy, drawW, drawH)
}

export function toOutlineCanvas(img, size = 224) {
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = size
  srcCanvas.height = size
  const sctx = srcCanvas.getContext('2d')
  drawContainFit(sctx, img, size)
  const { data } = sctx.getImageData(0, 0, size, size)

  const gray = new Float32Array(size * size)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const octx = out.getContext('2d')
  const outImg = octx.createImageData(size, size)
  outImg.data.fill(255) // untouched border pixels stay opaque white

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i00 = gray[(y - 1) * size + (x - 1)]
      const i01 = gray[(y - 1) * size + x]
      const i02 = gray[(y - 1) * size + (x + 1)]
      const i10 = gray[y * size + (x - 1)]
      const i12 = gray[y * size + (x + 1)]
      const i20 = gray[(y + 1) * size + (x - 1)]
      const i21 = gray[(y + 1) * size + x]
      const i22 = gray[(y + 1) * size + (x + 1)]

      const gx = -i00 - 2 * i10 - i20 + i02 + 2 * i12 + i22
      const gy = -i00 - 2 * i01 - i02 + i20 + 2 * i21 + i22
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy))

      const v = 255 - mag // white background, dark edges — a sketch/outline look
      const idx = (y * size + x) * 4
      outImg.data[idx] = v
      outImg.data[idx + 1] = v
      outImg.data[idx + 2] = v
      outImg.data[idx + 3] = 255
    }
  }
  octx.putImageData(outImg, 0, 0)
  return out
}

export function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const el = new Image()
    const url = URL.createObjectURL(blob)
    el.onload = () => {
      URL.revokeObjectURL(url)
      resolve(el)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that photo.'))
    }
    el.src = url
  })
}
