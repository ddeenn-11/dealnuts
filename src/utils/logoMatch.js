// On-device logo recognition: matches the captured photo against a small
// curated reference set of brand logos, entirely in the browser (no photo
// leaves the device). Uses MobileNet as a general-purpose feature
// extractor — not trained on logos specifically, but its embeddings
// capture enough visual structure for nearest-neighbor matching against a
// known, bounded set of brands. This can only ever recognize brands that
// are in the reference set; it's a complement to OCR text matching, not a
// replacement.
//
// Both the query photo and the reference set are preprocessed into a
// shape-only outline (see edges.js) before embedding, so a logo is matched
// by its mark, not its color — a red Nike swoosh and a black one embed
// close together.

import { toOutlineCanvas, loadImageFromBlob } from './edges.js'

// Bundled locally (public/models/) rather than fetched from tfhub.dev at
// runtime — this app is meant to be used standing in a store, often with
// poor connectivity, so the model ships with the app instead of depending
// on a live CDN fetch every time.
const MODEL_URL = '/models/mobilenet_v2_1.0_224/model.json'

let modelPromise = null
let referencePromise = null

function getModel() {
  if (!modelPromise) {
    modelPromise = Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/mobilenet')]).then(
      ([, mobilenetModule]) => mobilenetModule.load({ version: 2, alpha: 1.0, modelUrl: MODEL_URL })
    )
  }
  return modelPromise
}

function getReferenceEmbeddings() {
  if (!referencePromise) {
    referencePromise = fetch(new URL('../assets/logos/embeddings.json', import.meta.url)).then((res) => res.json())
  }
  return referencePromise
}

function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function embedBlob(model, blob) {
  const img = await loadImageFromBlob(blob)
  const outline = toOutlineCanvas(img)
  const embeddingTensor = model.infer(outline, true)
  const embedding = await embeddingTensor.data()
  embeddingTensor.dispose()
  return Array.from(embedding)
}

// A confidence floor below which a "best match" isn't worth surfacing — the
// reference set is small, so *something* is always the closest match even
// when the photo isn't any of these brands at all. In practice this floor
// alone isn't enough: a query photo that's mostly background/tag rather
// than a clean logo (e.g. a whole price tag photographed at once, logo
// tiny in-frame) can clear 0.55-0.7 confidence against the WRONG reference
// logo just as easily as a real match, because "confidence" here is really
// just "how close is the nearest neighbor", which is always something.
const MIN_CONFIDENCE = 0.7

// A real match should stand out clearly from the second-best candidate —
// when the photo doesn't actually contain any of the reference logos, the
// top few scores tend to bunch close together (nothing is a good fit, so
// several mediocre fits tie for "least bad"). Requiring a wide gap between
// #1 and #2 filters out exactly that case, which the confidence floor alone
// does not.
const MIN_MARGIN = 0.1

// Returns { brand, confidence } for the best-matching reference logo, or
// null if nothing clears the confidence floor and margin. brand is the
// human-readable display name (e.g. "Nike"), not the internal slug.
export async function matchLogo(blob) {
  const [model, references] = await Promise.all([getModel(), getReferenceEmbeddings()])
  const queryEmbedding = await embedBlob(model, blob)

  let best = null
  let bestScore = -Infinity
  let secondScore = -Infinity
  for (const ref of references) {
    const score = cosineSimilarity(queryEmbedding, ref.embedding)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      best = ref
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  if (!best || bestScore < MIN_CONFIDENCE) return null
  if (bestScore - secondScore < MIN_MARGIN) return null
  return { brand: best.display, confidence: bestScore }
}
