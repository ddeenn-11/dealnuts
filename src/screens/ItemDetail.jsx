import { useEffect, useState } from 'react'
import { getEntry, updateEntry, deleteEntry } from '../db.js'
import { formatDateTime, CATEGORIES, categoryLabel, subcategoriesFor } from '../utils/grouping.js'
import { mapLinkFor } from '../utils/geolocation.js'
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from '../utils/currency.js'

export default function ItemDetail({ entryId, onBack, onDeleted, onChanged }) {
  const [entry, setEntry] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getEntry(entryId).then((e) => {
      if (!cancelled) setEntry(e)
    })
    return () => {
      cancelled = true
    }
  }, [entryId])

  useEffect(() => {
    if (!entry?.photo) {
      setPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(entry.photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [entry])

  function startEdit() {
    setDraft({
      brand: entry.brand || '',
      category: entry.category || 'other',
      subcategory: entry.subcategory || '',
      price: entry.price ?? '',
      currency: entry.currency || DEFAULT_CURRENCY,
      description: entry.description || '',
      storeName: entry.storeName || '',
      storeNumber: entry.storeNumber || '',
    })
    setEditing(true)
  }

  function updateDraftCategory(value) {
    setDraft((d) => ({ ...d, category: value, subcategory: '' }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await updateEntry(entry.id, {
        ...draft,
        price: draft.price === '' ? null : Number(draft.price),
      })
      setEntry(updated)
      setEditing(false)
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this find? This can\'t be undone.')) return
    await deleteEntry(entry.id)
    onDeleted?.()
  }

  if (!entry) {
    return <div className="px-4 pt-10 text-center text-sm text-inkmuted">Loading…</div>
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-32 pt-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-inkmuted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back
      </button>

      <div className="tag-card overflow-hidden border border-line bg-surface shadow-card">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center text-inkmuted">No photo</div>
        )}
      </div>

      {!editing ? (
        <>
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="font-display text-2xl font-semibold text-ink">{entry.brand || 'Unbranded'}</h1>
              <p className="font-mono text-xl font-semibold text-deal">{formatMoney(entry.price, entry.currency)}</p>
            </div>
            <p className="text-inkmuted">
              {categoryLabel(entry.category)}
              {entry.subcategory ? ` · ${entry.subcategory}` : ''}
            </p>
          </div>

          <dl className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <Row label="Location" value={entry.storeName || '—'} />
            <Row label="Store #" value={entry.storeNumber || '—'} />
            <Row
              label="Map"
              value={
                entry.latitude != null ? (
                  <a
                    href={mapLinkFor(entry.latitude, entry.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-deal underline decoration-dotted"
                  >
                    View on map
                  </a>
                ) : (
                  'Not captured'
                )
              }
            />
            <Row label="Description" value={entry.description || '—'} />
            <Row label="Logged" value={<span className="font-mono">{formatDateTime(entry.dateAdded)}</span>} />
          </dl>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={startEdit}
              className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium text-ink transition-colors hover:border-tag hover:text-tag"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium text-inkmuted transition-colors hover:border-tag hover:text-tag"
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input
                className="field-input"
                value={draft.storeName}
                onChange={(e) => setDraft((d) => ({ ...d, storeName: e.target.value }))}
              />
            </Field>
            <Field label="Store # (optional)">
              <input
                className="field-input"
                value={draft.storeNumber}
                onChange={(e) => setDraft((d) => ({ ...d, storeNumber: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <input
                className="field-input"
                value={draft.brand}
                onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
              />
            </Field>
            <Field label="Category">
              <select
                className="field-input"
                value={draft.category}
                onChange={(e) => updateDraftCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {subcategoriesFor(draft.category).length > 0 && (
            <Field label="Subcategory">
              <select
                className="field-input"
                value={draft.subcategory}
                onChange={(e) => setDraft((d) => ({ ...d, subcategory: e.target.value }))}
              >
                <option value="">None</option>
                {subcategoriesFor(draft.category).map((s) => (
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
                className="field-input w-24 shrink-0 font-mono text-sm"
                value={draft.currency}
                onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                className="field-input font-mono"
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              />
            </div>
          </Field>
          <Field label="Description">
            <textarea
              rows={3}
              className="field-input resize-none"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </Field>
          <p className="text-xs text-inkmuted">
            Logged {formatDateTime(entry.dateAdded)} — this timestamp can't be edited.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-full border border-line py-2.5 text-sm font-medium text-inkmuted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-full bg-tag py-2.5 text-sm font-semibold text-surface disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="shrink-0 text-inkmuted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
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
