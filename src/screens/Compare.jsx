import { useEffect, useMemo, useState } from 'react'
import { getAllEntries } from '../db.js'
import { formatDateTime, categoryLabel } from '../utils/grouping.js'
import { mapLinkFor } from '../utils/geolocation.js'
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from '../utils/currency.js'
import { fetchRates, convert } from '../utils/fx.js'
import EntryCard from '../components/EntryCard.jsx'

export default function Compare({ refreshKey, presetIds, onOpenEntry }) {
  const [entries, setEntries] = useState([])
  const [selectedIds, setSelectedIds] = useState(presetIds || [])
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

  const selectedEntries = useMemo(
    () => selectedIds.map((id) => entries.find((e) => e.id === id)).filter(Boolean),
    [selectedIds, entries]
  )

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

  if (entries.length < 2) {
    return (
      <div className="mx-auto max-w-md px-4 pb-28 pt-10">
        <p className="text-center text-sm text-inkmuted">Log at least two finds to compare them side by side.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-32 pt-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-wide text-inkmuted">Decision time</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Compare</h1>
      </header>

      {selectedEntries.length < 2 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-inkmuted">Pick two or more finds to compare.</p>
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selectable
              selected={selectedIds.includes(entry.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {selectedEntries.length >= 2 && (
        <>
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
            <table className="w-full min-w-[560px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="w-24" />
                  {selectedEntries.map((entry) => (
                    <th key={entry.id} className="pb-2 text-left align-bottom">
                      <button type="button" onClick={() => onOpenEntry(entry.id)} className="block w-40">
                        <Thumb entry={entry} />
                        <span className="mt-1.5 block font-display text-sm font-semibold text-ink">
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

function Thumb({ entry }) {
  const url = entry.photo ? URL.createObjectURL(entry.photo) : null
  return (
    <span className="tag-card block aspect-square w-40 overflow-hidden border border-line bg-surface">
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
      <th className="whitespace-nowrap border-t border-line py-2.5 pr-3 text-left text-xs font-medium text-inkmuted">
        {label}
      </th>
      {entries.map((entry) => (
        <td
          key={entry.id}
          className={`whitespace-nowrap border-t border-line py-2.5 pr-4 text-sm text-ink ${
            mono ? 'font-mono' : ''
          } ${strong ? 'font-semibold text-deal' : ''}`}
        >
          {render(entry)}
        </td>
      ))}
    </tr>
  )
}
