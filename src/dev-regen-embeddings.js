// Dev-only tool: recomputes src/assets/logos/embeddings.json using the same
// outline preprocessing logoMatch.js applies to live query photos (see
// edges.js). Run via `npm run dev`, open /regen-embeddings.html, click
// Generate, then copy the textarea contents into embeddings.json. Not part
// of the shipped app — nothing here is imported by the React entry point.

import { toOutlineCanvas, loadImageFromBlob } from './utils/edges.js'

const MODEL_URL = '/models/mobilenet_v2_1.0_224/model.json'

async function getModel() {
  const [, mobilenetModule] = await Promise.all([
    import('@tensorflow/tfjs'),
    import('@tensorflow-models/mobilenet'),
  ])
  return mobilenetModule.load({ version: 2, alpha: 1.0, modelUrl: MODEL_URL })
}

async function run() {
  const statusEl = document.getElementById('status')
  const outputEl = document.getElementById('output')
  const setStatus = (s) => {
    statusEl.textContent = s
    console.log(s)
  }

  setStatus('Loading model…')
  const model = await getModel()

  setStatus('Loading manifest…')
  const manifestUrl = new URL('./assets/logos/_manifest.json', import.meta.url)
  const manifest = await fetch(manifestUrl).then((r) => r.json())
  const entries = Object.entries(manifest).filter(([, v]) => v.status === 'ok')

  const results = []
  for (let i = 0; i < entries.length; i++) {
    const [slug, info] = entries[i]
    setStatus(`Embedding ${i + 1}/${entries.length}: ${info.display}`)
    try {
      const logoUrl = new URL(`./assets/logos/${slug}.png`, import.meta.url)
      const blob = await fetch(logoUrl).then((r) => r.blob())
      const img = await loadImageFromBlob(blob)
      const outline = toOutlineCanvas(img)
      const tensor = model.infer(outline, true)
      const embedding = Array.from(await tensor.data())
      tensor.dispose()
      results.push({ slug, display: info.display, embedding })
    } catch (err) {
      console.error(`Failed on ${slug}:`, err)
      setStatus(`Failed on ${slug}: ${err.message}`)
      return
    }
  }

  const json = JSON.stringify(results)
  outputEl.value = json
  setStatus(`Done — ${results.length} embeddings, ${(json.length / 1024).toFixed(0)}KB. Copy the textarea into embeddings.json.`)
  window.__embeddingsResult = json
}

document.getElementById('run').addEventListener('click', () => {
  run().catch((err) => {
    document.getElementById('status').textContent = 'Error: ' + err.message
    console.error(err)
  })
})
