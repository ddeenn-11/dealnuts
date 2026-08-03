import { useEffect, useRef, useState } from 'react'
import { addEntry } from '../db.js'
import { getCurrentPosition, reverseGeocode } from '../utils/geolocation.js'
import { compressImage } from '../utils/image.js'
import { CATEGORIES, subcategoriesFor } from '../utils/grouping.js'
import { scanTag } from '../utils/ocr.js'
import { CURRENCIES, DEFAULT_CURRENCY } from '../utils/currency.js'

const emptyForm = {
  brand: '',
  category: 'clothing',
  subcategory: '',
  price: '',
  currency: DEFAULT_CURRENCY,
  description: '',
  storeName: '',
  storeNumber: '',
}

export default function AddEntry({ onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('locating') // locating | ok | error
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const cameraInputRef = useRef(null)
  const libraryInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function locate() {
      setLocationStatus('locating')
      try {
        const pos = await getCurrentPosition()
        if (cancelled) return
        setCoords(pos)
        setLocationStatus('ok')
        const name = await reverseGeocode(pos.latitude, pos.longitude)
        if (!cancelled && name) {
          setForm((f) => (f.storeName ? f : { ...f, storeName: name }))
        }
      } catch {
        if (!cancelled) setLocationStatus('error')
      }
    }

    locate()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(photoBlob)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoBlob])

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    let compressed = file
    try {
      compressed = await compressImage(file)
    } catch {
      // fall back to the original file if resizing failed
    }
    setPhotoBlob(compressed)
    runScan(compressed)
  }

  async function runScan(blob) {
    setScanning(true)
    try {
      const hints = await scanTag(blob)
      const descriptionHints = [hints.color && `Color: ${hints.color}`, hints.size && `Size ${hints.size}`]
        .filter(Boolean)
        .join(', ')
      setForm((f) => ({
        ...f,
        brand: f.brand || hints.brand,
        price: f.price || hints.price,
        // Only apply the category guess if the user hasn't picked one
        // themselves yet — never override a manual choice.
        category: !categoryTouched && hints.category ? hints.category : f.category,
        subcategory: !categoryTouched && hints.category ? hints.subcategory : f.subcategory,
        description: f.description || descriptionHints || f.description,
      }))
    } catch {
      // OCR is best-effort — leave fields as-is if it fails
    } finally {
      setScanning(false)
    }
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateCategory(value) {
    setCategoryTouched(true)
    setForm((f) => ({ ...f, category: value, subcategory: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await addEntry({
        photo: photoBlob || null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        storeName: form.storeName.trim(),
        storeNumber: form.storeNumber.trim(),
        brand: form.brand.trim(),
        category: form.category,
        subcategory: form.subcategory,
        price: form.price === '' ? null : Number(form.price),
        currency: form.currency,
        description: form.description.trim(),
      })
      setForm(emptyForm)
      setPhotoBlob(null)
      setCategoryTouched(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (libraryInputRef.current) libraryInputRef.current.value = ''
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const subcategoryOptions = subcategoriesFor(form.category)

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-36 pt-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-wide text-inkmuted">Buy Right</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Log what you see</h1>
      </header>

      <div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="sr-only"
          id="camera-input"
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="sr-only"
          id="library-input"
        />

        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface text-inkmuted">
          {photoPreview ? (
            <img src={photoPreview} alt="Captured product" className="h-full w-full object-cover" />
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.66-.9L9.6 4.1A2 2 0 0 1 11.26 3.2h1.48a2 2 0 0 1 1.66.9l.74 1a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
                <circle cx="12" cy="12.5" r="3.4" />
              </svg>
              <span className="text-sm font-medium">Add a photo of the item or tag</span>
            </>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <label
            htmlFor="camera-input"
            className="flex-1 cursor-pointer rounded-lg border border-line bg-surface py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-tag hover:text-tag"
          >
            Take Photo
          </label>
          <label
            htmlFor="library-input"
            className="flex-1 cursor-pointer rounded-lg border border-line bg-surface py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-tag hover:text-tag"
          >
            Choose from Library
          </label>
        </div>

        {scanning && (
          <p className="mt-2 text-xs text-inkmuted">Scanning tag for brand, price, category &amp; color…</p>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            locationStatus === 'ok' ? 'bg-deal' : locationStatus === 'error' ? 'bg-tag' : 'bg-line'
          }`}
          aria-hidden
        />
        <span className="text-inkmuted">
          {locationStatus === 'locating' && 'Finding your location…'}
          {locationStatus === 'ok' && 'Location captured'}
          {locationStatus === 'error' && "Couldn't get your location — you can still add it manually below."}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Location">
          <input
            type="text"
            value={form.storeName}
            onChange={(e) => updateField('storeName', e.target.value)}
            placeholder="e.g. 5th Ave, Manhattan"
            className="field-input"
          />
        </Field>
        <Field label="Store # (optional)">
          <input
            type="text"
            value={form.storeNumber}
            onChange={(e) => updateField('storeNumber', e.target.value)}
            placeholder="e.g. Unit 234"
            className="field-input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand">
          <input
            type="text"
            value={form.brand}
            onChange={(e) => updateField('brand', e.target.value)}
            placeholder="e.g. Nike"
            className="field-input"
          />
        </Field>
        <Field label="Category">
          <select
            value={form.category}
            onChange={(e) => updateCategory(e.target.value)}
            className="field-input"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {subcategoryOptions.length > 0 && (
        <Field label="Subcategory">
          <select
            value={form.subcategory}
            onChange={(e) => updateField('subcategory', e.target.value)}
            className="field-input"
          >
            <option value="">None</option>
            {subcategoryOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Price">
        <div className="flex gap-2">
          <select
            value={form.currency}
            onChange={(e) => updateField('currency', e.target.value)}
            className="field-input w-24 shrink-0 font-mono text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => updateField('price', e.target.value)}
            placeholder="0.00"
            className="field-input font-mono"
          />
        </div>
      </Field>

      <Field label="Description (color, size, notes)">
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="e.g. Olive green, size M, slightly boxy fit"
          rows={3}
          className="field-input resize-none"
        />
      </Field>

      <div className="fixed inset-x-0 bottom-32 z-10 mx-auto max-w-md px-4">
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-tag py-3.5 font-display text-base font-semibold text-surface shadow-card transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save this find'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-inkmuted">{label}</span>
      {children}
    </label>
  )
}
