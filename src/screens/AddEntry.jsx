import { useEffect, useRef, useState } from 'react'
import { addEntry } from '../db.js'
import { getCurrentPosition, reverseGeocode } from '../utils/geolocation.js'
import { compressImage } from '../utils/image.js'
import { CATEGORY_OPTIONS } from '../utils/grouping.js'

const emptyForm = {
  brand: '',
  category: 'clothing',
  price: '',
  description: '',
  storeName: '',
}

export default function AddEntry({ onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('locating') // locating | ok | error
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

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
    try {
      const compressed = await compressImage(file)
      setPhotoBlob(compressed)
    } catch {
      setPhotoBlob(file)
    }
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
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
        brand: form.brand.trim(),
        category: form.category,
        price: form.price === '' ? null : Number(form.price),
        description: form.description.trim(),
      })
      setForm(emptyForm)
      setPhotoBlob(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-28 pt-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-wide text-inkmuted">New find</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Log what you see</h1>
      </header>

      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="sr-only"
          id="photo-input"
        />
        <label
          htmlFor="photo-input"
          className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface text-inkmuted transition-colors hover:border-tag"
        >
          {photoPreview ? (
            <img src={photoPreview} alt="Captured product" className="h-full w-full rounded-[10px] object-cover" />
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.66-.9L9.6 4.1A2 2 0 0 1 11.26 3.2h1.48a2 2 0 0 1 1.66.9l.74 1a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
                <circle cx="12" cy="12.5" r="3.4" />
              </svg>
              <span className="text-sm font-medium">Take a photo of the item or tag</span>
            </>
          )}
        </label>
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
          {locationStatus === 'error' && "Couldn't get your location — you can still add the store name manually."}
        </span>
      </div>

      <Field label="Store">
        <input
          type="text"
          value={form.storeName}
          onChange={(e) => updateField('storeName', e.target.value)}
          placeholder="e.g. Uniqlo, 5th Ave"
          className="field-input"
        />
      </Field>

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
            onChange={(e) => updateField('category', e.target.value)}
            className="field-input capitalize"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Price">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-inkmuted">$</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => updateField('price', e.target.value)}
            placeholder="0.00"
            className="field-input pl-6 font-mono"
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

      <div className="fixed inset-x-0 bottom-24 z-10 mx-auto max-w-md px-4">
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
