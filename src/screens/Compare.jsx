import { useEffect, useMemo, useState } from 'react'
import { getAllEntries } from '../db.js'
import { formatDateTime, categoryLabel } from '../utils/grouping.js'
import { mapLinkFor } from '../utils/geolocation.js'
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from '../utils/currency.js'
import { fetchRates, convert } from '../utils/fx.js'

const LAST_COMPARE_KEY = 'buyright-last-compare'

function loadLastCompare() {
  try {
    const raw = localStorage.getItem(LAST_COMPARE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLastCompare(ids) {
  try {
    localStorage.setItem(LAST_COMPARE_KEY, JSON.stringify(ids))
  } catch {
    // ignore storage errors (private mode, quota, etc.) — nothing to persist to
  }
}

export default function Compare({ refreshKey, presetIds, onOpenEntry }) {
  const [entries, setEntries] = useState([])
  const [selectedIds, setSelectedIds] = useState(() =>
    presetIds && presetIds.length ? presetIds : loadLastCompare()
  )
  const [loading, setLoading] = useState(true)
  const [compareCurrency, setCompareCurrency] = useState(DEFAULT_CURRENCY)
  const [fxData, setFxData] = useState(null)
  const [fxLoading, setFxLoading] = useState(false)
  const [fxError, setFxError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAllEntries().then((e) => {
      if (!cancelled) {
        setEntries(e)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  useEffect(() => {
    if (presetIds && presetIds.length) setSelectedIds(presetIds)
  }, [presetIds])

  useEffect(() => {
    saveLastCompare(selectedIds)
  }, [selectedIds])

  const selectedEntries = useMemo(
    () => selectedIds.map((id) => entries.find((e) => e.id === id)).filter(Boolean),
    [selectedIds, entries]
  )

  const fitsWithoutScroll = selectedEntries.length <= 2

  useEffect(() => {
    if (selectedEntries.length < 2) return
    let cancelled = false
    setFxLoading(true)
    setFxError(false)
    fetchRates(compareCurrency)
      .then((result) => {
        if (!cancelled) setFxData(result)
      })
      .catch(() => {
        if (!cancelled) setFxError(true)
      })
      .finally(() => {
        if (!cancelled) setFxLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [compareCurrency, selectedEntries.length])

  const otherCurrencies = useMemo(() => {
    const set = new Set(selectedEntries.map((e) => e.currency || DEFAULT_CURRENCY))
    set.delete(compareCurrency)
    return [...set]
  }, [selectedEntries, compareCurrency])

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleClearAll() {
    setSelectedIds([])
  }

  function priceInCompareCurrency(entry) {
    const entryCurrency = entry.currency || DEFAULT_CURRENCY
    if (entryCurrency === compareCurrency || !fxData || fxError) {
      return formatMoney(entry.price, entryCurrency)
    }
    const converted = convert(entry.price, entryCurrency, fxData.rates)
    return converted === null ? formatMoney(entry.price, entryCurrency) : formatMoney(converted, compareCurrency)
  }

  if (loading) {
    return <div className="px-4 pt-10 text-center text-sm text-inkmuted">Loading…</div>
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-40 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-inkmuted">Decision time</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Compare</h1>
        </div>
        {selectedEntries.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-inkmuted transition-colors hover:border-tag hover:text-tag"
          >
            Clear all
          </button>
        )}
      </header>

      {selectedEntries.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {selectedEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => toggleSelect(entry.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-tag bg-tag/10 px-3 py-1.5 text-xs font-medium text-tagdark"
            >
              {entry.brand || 'Unbranded'}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      {selectedEntries.length < 2 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
          <p className="font-display text-lg font-semibold text-ink">
            {selectedEntries.length === 0 ? 'Nothing to compare yet' : 'Add one more to compare'}
          </p>
          <p className="max-w-[26ch] text-sm text-inkmuted">
            Go to Finds, tap items to select them, then tap "Compare" once you have two or more.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-inkmuted">Compare prices in</span>
              <select
                value={compareCurrency}
                onChange={(e) => setCompareCurrency(e.target.value)}
                className="field-input w-24 py-1.5 text-sm font-mono"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {fxLoading && <p className="text-xs text-inkmuted">Fetching exchange rates…</p>}
            {fxError && (
              <p className="text-xs text-tag">Couldn't fetch exchange rates — showing original prices.</p>
            )}
            {fxData && !fxError && (
              <div className="flex flex-col gap-0.5 text-xs text-inkmuted">
                {otherCurrencies
                  .filter((c) => fxData.rates[c])
                  .map((c) => (
                    <p key={c} className="font-mono">
                      1 {compareCurrency} = {fxData.rates[c].toFixed(4)} {c}
                    </p>
                  ))}
                <p>Rates as of {fxData.timestamp}</p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table
              className={`border-separate border-spacing-0 ${
                fitsWithoutScroll ? 'w-full table-fixed' : 'min-w-[560px]'
              }`}
            >
              <thead>
                <tr>
                  <th className="w-16" />
                  {selectedEntries.map((entry) => (
                    <th key={entry.id} className="pb-2 text-left align-bottom">
                      <button
                        type="button"
                        onClick={() => onOpenEntry(entry.id)}
                        className={fitsWithoutScroll ? 'block w-full' : 'block w-32'}
                      >
                        <Thumb entry={entry} compact={fitsWithoutScroll} />
                        <span className="mt-1.5 block truncate font-display text-sm font-semibold text-ink">
                          {entry.brand || 'Unbranded'}
                        </span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  label="Price"
                  entries={selectedEntries}
                  render={priceInCompareCurrency}
                  mono
                  strong
                />
                <CompareRow
                  label="Category"
                  entries={selectedEntries}
                  render={(e) => (e.category ? `${categoryLabel(e.category)}${e.subcategory ? ` · ${e.subcategory}` : ''}` : '—')}
                />
                <CompareRow label="Location" entries={selectedEntries} render={(e) => e.storeName || '—'} />
                <CompareRow label="Store #" entries={selectedEntries} render={(e) => e.storeNumber || '—'} />
                <CompareRow
                  label="Map"
                  entries={selectedEntries}
                  render={(e) =>
                    e.latitude != null ? (
                      <a
                        href={mapLinkFor(e.latitude, e.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-deal underline decoration-dotted"
                      >
                        View map
                      </a>
                    ) : (
                      '—'
                    )
                  }
                />
                <CompareRow label="Description" entries={selectedEntries} render={(e) => e.description || '—'} />
                <CompareRow label="Logged" entries={selectedEntries} render={(e) => formatDateTime(e.dateAdded)} mono />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Thumb({ entry, compact }) {
  const url = entry.photo ? URL.createObjectURL(entry.photo) : null
  return (
    <span
      className={`tag-card block aspect-square overflow-hidden border border-line bg-surface ${
        compact ? 'w-full' : 'w-32'
      }`}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-inkmuted">No photo</span>
      )}
    </span>
  )
}

function CompareRow({ label, entries, render, mono = false, strong = false }) {
  return (
    <tr>
      <th className="border-t border-line py-2.5 pr-2 text-left text-xs font-medium text-inkmuted">
        {label}
      </th>
      {entries.map((entry) => (
        <td
          key={entry.id}
          className={`truncate border-t border-line py-2.5 pr-3 text-sm text-ink ${
            mono ? 'font-mono' : ''
          } ${strong ? 'font-semibold text-deal' : ''}`}
        >
          {render(entry)}
        </td>
      ))}
    </tr>
  )
}
