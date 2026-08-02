import { useEffect, useState } from 'react'
import { formatPrice, formatDateTime } from '../utils/grouping.js'

export default function EntryCard({ entry, onClick, selectable = false, selected = false, onToggleSelect }) {
  const [photoUrl, setPhotoUrl] = useState(null)

  useEffect(() => {
    if (!entry.photo) {
      setPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(entry.photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [entry.photo])

  const handleClick = () => {
    if (selectable) {
      onToggleSelect?.(entry.id)
    } else {
      onClick?.(entry.id)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`tag-card group flex w-full items-center gap-3 border bg-surface p-3 pl-4 text-left shadow-card transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tag ${
        selected ? 'border-tag ring-2 ring-tag/40' : 'border-line'
      }`}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-paper">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-inkmuted">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <circle cx="12" cy="12.5" r="3.2" />
            </svg>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-display text-sm font-semibold text-ink">
            {entry.brand || 'Unbranded'}
          </p>
          <p className="shrink-0 font-mono text-sm font-semibold text-deal">
            ${formatPrice(entry.price)}
          </p>
        </div>
        <p className="truncate text-xs capitalize text-inkmuted">{entry.category || 'other'}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-inkmuted">
          {entry.storeName && <span className="truncate">{entry.storeName}</span>}
          {entry.storeName && <span aria-hidden>·</span>}
          <span className="font-mono">{formatDateTime(entry.dateAdded)}</span>
        </div>
      </div>

      {selectable && (
        <div
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            selected ? 'border-tag bg-tag text-surface' : 'border-line text-transparent'
          }`}
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      )}
    </button>
  )
}
