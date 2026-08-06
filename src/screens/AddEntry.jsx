import { useEffect, useRef, useState } from 'react'
import { addEntry } from '../db.js'
import { getCurrentPosition, reverseGeocode } from '../utils/geolocation.js'
import { compressImage } from '../utils/image.js'
import { CATEGORIES, subcategoriesFor } from '../utils/grouping.js'
import { scanTag, preloadOcrWorker } from '../utils/ocr.js'
import { cloudScanTag } from '../utils/cloudScan.js'
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

// Which OCR-derived fields are worth writing into the description depends
// on the category — a garment's color/size is meaningful shorthand, but
// makes no sense for a bottle of serum or a bag of rice, which are better
// described by their weight/volume instead. Every other category (Home,
// Electronics, Kids, etc.) gets no auto-fill — no field guessed so far is
// a reliable enough shorthand for them yet.
const SIZE_COLOR_HINT_CATEGORIES = ['clothing', 'shoes', 'luxury', 'bags']
const QUANTITY_HINT_CATEGORIES = ['beauty', 'groceries']

export default function AddEntry({ onSaved }) {
  const [form, setForm] = useState(emptyForm)
  const [photoBlob, setPhotoBlob] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [coords, setCoords] = useState(null)
  const [locationStatus, setLocationStatus] = useState('locating') // locating | ok | error
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanPhase, setScanPhase] = useState(null) // null | 'local' | 'cloud'
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [currencyTouched, setCurrencyTouched] = useState(false)
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

  // Warm the OCR worker (WASM + language data) as soon as this screen
  // opens, instead of paying that cold-start cost when the user takes
  // their first photo and is actually waiting on it.
  useEffect(() => {
    preloadOcrWorker()
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

    // Taking/importing a new photo starts a new find — clear whatever a
    // previous, unsaved scan filled in so it can't bleed into this one
    // (same reasoning as the reset after Save). Location/Store # are left
    // alone since they're not scan output — still correct for the next
    // item found at the same place.
    setForm((f) => ({ ...emptyForm, storeName: f.storeName, storeNumber: f.storeNumber }))
    setCategoryTouched(false)
    setCurrencyTouched(false)

    // Stored copy and OCR copy are independent resizes of the same file —
    // run them together instead of one after another so scanning can start
    // as soon as the (usually similar-cost) OCR copy is ready, not after
    // waiting for both in sequence.
    const [compressed, ocrBlob] = await Promise.all([
      compressImage(file).catch(() => file),
      // OCR gets its own, sharper pass — small tag text needs more pixels
      // than the 1024px/quality-0.7 version we store, so scanning the
      // stored blob directly was leaving detail on the table.
      compressImage(file, 1600, 0.9).catch(() => file),
    ])
    setPhotoBlob(compressed)
    runScan(ocrBlob)
  }

  async function runScan(blob) {
    setScanning(true)
    setScanPhase('local')
    // Tracks whether the local pass already applied a category/currency
    // guess, since both fields always hold a real (non-blank) value in
    // form state — unlike brand/price, `f.category`/`f.currency` being
    // non-empty doesn't by itself mean "already filled by a guess."
    let localAppliedCategory = false
    let localAppliedCurrency = false
    try {
      const hints = await scanTag(blob)

      // Applied as soon as local OCR resolves — fields it found (which is
      // most of them, most of the time) show up immediately instead of
      // waiting on a possible cloud round-trip below for fields that were
      // never going to change.
      localAppliedCategory = !categoryTouched && !!hints.category
      localAppliedCurrency = !currencyTouched && !!hints.currency

      // `form.category` is only a meaningful signal here if the user
      // actually chose it (categoryTouched) — otherwise it's just sitting
      // at the form's arbitrary default ('clothing'), which is not
      // evidence this item is clothing. Falling back to it unconditionally
      // used to make an untouched default look identical to a real
      // Clothing detection, routing items OCR couldn't categorize at all
      // (no keyword match, no recognized brand) into the Color/Size
      // description branch instead of leaving description alone.
      const effectiveCategory = localAppliedCategory ? hints.category : categoryTouched ? form.category : ''
      let descriptionHints = ''
      if (SIZE_COLOR_HINT_CATEGORIES.includes(effectiveCategory)) {
        descriptionHints = [hints.color && `Color: ${hints.color}`, hints.size && `Size ${hints.size}`]
          .filter(Boolean)
          .join(', ')
      } else if (QUANTITY_HINT_CATEGORIES.includes(effectiveCategory) && hints.quantity) {
        descriptionHints = `Qty: ${hints.quantity}`
      }

      setForm((f) => ({
        ...f,
        brand: f.brand || hints.brand,
        price: f.price || hints.price,
        category: localAppliedCategory ? hints.category : f.category,
        subcategory: localAppliedCategory ? hints.subcategory : f.subcategory,
        currency: localAppliedCurrency ? hints.currency : f.currency,
        description: f.description || descriptionHints || f.description,
      }))

      // Brand and price are the two fields local, on-device OCR struggles
      // with most — brand because it only ever matches our own curated
      // list, price because tag layouts vary too much for regex alone.
      // Escalating to a hosted vision model only when one of those is
      // still blank keeps the (photo-leaves-device) cloud call to the
      // cases that actually need it, rather than every scan.
      if (!hints.brand || !hints.price) {
        setScanPhase('cloud')
        const cloudHints = await cloudScanTag(blob)
        if (cloudHints) {
          setForm((f) => ({
            ...f,
            // Local wins whenever both found something — cloud only ever
            // fills in what local OCR left blank (checked against current
            // form state, so anything the local pass — or the user, while
            // this was in flight — already filled stays put).
            brand: f.brand || cloudHints.brand,
            price: f.price || cloudHints.price,
            category: !localAppliedCategory && !categoryTouched && cloudHints.category ? cloudHints.category : f.category,
            subcategory:
              !localAppliedCategory && !categoryTouched && cloudHints.category ? cloudHints.subcategory : f.subcategory,
            currency: !localAppliedCurrency && !currencyTouched && cloudHints.currency ? cloudHints.currency : f.currency,
          }))
        }
      }
    } catch {
      // OCR is best-effort — leave fields as-is if it fails
    } finally {
      setScanning(false)
      setScanPhase(null)
    }
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function updateCategory(value) {
    setCategoryTouched(true)
    setForm((f) => ({ ...f, category: value, subcategory: '' }))
  }

  function updateCurrency(value) {
    setCurrencyTouched(true)
    setForm((f) => ({ ...f, currency: value }))
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
      setCurrencyTouched(false)
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

        <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-line bg-surface text-inkmuted">
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
          {scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/60 text-surface backdrop-blur-[1px]">
              <svg className="h-7 w-7 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-30" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
                <path
                  className="opacity-95"
                  fill="currentColor"
                  d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z"
                />
              </svg>
              <span className="px-4 text-center text-xs font-medium">
                {scanPhase === 'cloud' ? 'Double-checking price & brand…' : 'Reading tag…'}
              </span>
            </div>
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
        <Field label="Category" className={subcategoryOptions.length > 0 ? '' : 'col-span-2'}>
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
      </div>

      <Field label="Brand">
        <input
          type="text"
          value={form.brand}
          onChange={(e) => updateField('brand', e.target.value)}
          placeholder="e.g. Nike"
          className="field-input"
        />
      </Field>

      <Field label="Price">
        <div className="flex gap-2">
          <select
            value={form.currency}
            onChange={(e) => updateCurrency(e.target.value)}
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

function Field({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-inkmuted">{label}</span>
      {children}
    </label>
  )
}
