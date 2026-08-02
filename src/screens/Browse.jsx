import { useEffect, useMemo, useState } from 'react'
import EntryCard from '../components/EntryCard.jsx'
import {
  getAllEntries,
  getAllGroups,
  createGroup,
  addEntryToGroup,
  removeEntryFromGroup,
  exportAllAsJson,
  deleteEntry,
} from '../db.js'
import { autoGroupEntries } from '../utils/grouping.js'

export default function Browse({ refreshKey, onOpenEntry, onCompareSelected }) {
  const [entries, setEntries] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('auto') // 'auto' | 'manual'
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [groupPickerFor, setGroupPickerFor] = useState(null) // entry id, or null

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [e, g] = await Promise.all([getAllEntries(), getAllGroups()])
      if (!cancelled) {
        setEntries(e)
        setGroups(g)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      [e.brand, e.category, e.subcategory, e.storeName, e.storeNumber, e.description]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q))
    )
  }, [entries, query])

  const autoGroups = useMemo(() => autoGroupEntries(filteredEntries), [filteredEntries])

  const manualGroupsWithEntries = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]))
    return groups.map((g) => ({
      ...g,
      resolvedEntries: g.entryIds.map((id) => byId.get(id)).filter(Boolean),
    }))
  }, [groups, entries])

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function exitSelectMode() {
    setSelecting(false)
    setSelectedIds([])
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    const label = selectedIds.length === 1 ? 'this find' : `these ${selectedIds.length} finds`
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return
    await Promise.all(selectedIds.map((id) => deleteEntry(id)))
    setEntries((prev) => prev.filter((e) => !selectedIds.includes(e.id)))
    exitSelectMode()
  }

  async function handleExport() {
    const json = await exportAllAsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `buyright-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function handleCreateGroup() {
    const name = window.prompt('Name this group (e.g. "Weekend trip")')
    if (!name || !name.trim()) return
    const group = await createGroup(name)
    setGroups((prev) => [...prev, group])
  }

  async function handleAddToGroup(entryId, groupId) {
    await addEntryToGroup(groupId, entryId)
    const g = await getAllGroups()
    setGroups(g)
    setGroupPickerFor(null)
  }

  async function handleRemoveFromGroup(entryId, groupId) {
    await removeEntryFromGroup(groupId, entryId)
    const g = await getAllGroups()
    setGroups(g)
  }

  if (loading) {
    return <div className="px-4 pt-10 text-center text-sm text-inkmuted">Loading your finds…</div>
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-40 pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wide text-inkmuted">
            {entries.length} logged
          </p>
          <h1 className="font-display text-2xl font-semibold text-ink">Your finds</h1>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-inkmuted transition-colors hover:border-tag hover:text-tag"
        >
          Export
        </button>
      </header>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search brand, category, store…"
            className="field-input"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1 rounded-full bg-surface p-1 text-xs font-medium">
              <ModeButton active={mode === 'auto'} onClick={() => setMode('auto')}>
                Auto groups
              </ModeButton>
              <ModeButton active={mode === 'manual'} onClick={() => setMode('manual')}>
                My groups
              </ModeButton>
            </div>

            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => (selecting ? exitSelectMode() : setSelecting(true))}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selecting ? 'border-tag text-tag' : 'border-line text-inkmuted hover:border-tag hover:text-tag'
                }`}
              >
                {selecting ? 'Cancel' : 'Select'}
              </button>
              {selecting && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.length === 0}
                  className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-inkmuted transition-colors hover:border-tag hover:text-tag disabled:opacity-40"
                >
                  Delete{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
                </button>
              )}
            </div>
          </div>

          {mode === 'auto' &&
            autoGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="font-display text-sm font-semibold text-ink">{group.label}</h2>
                <div className="flex flex-col gap-2">
                  {group.entries.map((entry) => (
                    <EntryWithGroupPicker
                      key={entry.id}
                      entry={entry}
                      selecting={selecting}
                      selected={selectedIds.includes(entry.id)}
                      onToggleSelect={toggleSelect}
                      onOpen={onOpenEntry}
                      groups={groups}
                      pickerOpen={groupPickerFor === entry.id}
                      onOpenPicker={() => setGroupPickerFor(entry.id)}
                      onClosePicker={() => setGroupPickerFor(null)}
                      onAddToGroup={handleAddToGroup}
                    />
                  ))}
                </div>
              </section>
            ))}

          {mode === 'manual' && (
            <div className="flex flex-col gap-5">
              <button
                type="button"
                onClick={handleCreateGroup}
                className="rounded-lg border border-dashed border-line py-2.5 text-sm font-medium text-inkmuted transition-colors hover:border-tag hover:text-tag"
              >
                + New group
              </button>
              {manualGroupsWithEntries.length === 0 && (
                <p className="text-center text-sm text-inkmuted">
                  No custom groups yet. Create one, then use "Add to group" on any find.
                </p>
              )}
              {manualGroupsWithEntries.map((group) => (
                <section key={group.id} className="flex flex-col gap-2">
                  <h2 className="font-display text-sm font-semibold text-ink">{group.name}</h2>
                  {group.resolvedEntries.length === 0 ? (
                    <p className="text-xs text-inkmuted">No finds added yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {group.resolvedEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-2">
                          <div className="flex-1">
                            <EntryCard
                              entry={entry}
                              onClick={onOpenEntry}
                              selectable={selecting}
                              selected={selectedIds.includes(entry.id)}
                              onToggleSelect={toggleSelect}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFromGroup(entry.id, group.id)}
                            className="shrink-0 text-xs text-inkmuted underline decoration-dotted"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {selecting && selectedIds.length >= 2 && (
        <button
          type="button"
          onClick={() => onCompareSelected(selectedIds)}
          className="fixed bottom-32 left-1/2 z-20 -translate-x-1/2 rounded-full bg-tag px-6 py-3 font-display text-sm font-semibold text-surface shadow-card"
        >
          Compare {selectedIds.length} finds
        </button>
      )}
    </div>
  )
}

function EntryWithGroupPicker({
  entry,
  selecting,
  selected,
  onToggleSelect,
  onOpen,
  groups,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onAddToGroup,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <EntryCard
            entry={entry}
            onClick={onOpen}
            selectable={selecting}
            selected={selected}
            onToggleSelect={onToggleSelect}
          />
        </div>
        {!selecting && (
          <button
            type="button"
            onClick={() => (pickerOpen ? onClosePicker() : onOpenPicker())}
            className="shrink-0 text-xs text-inkmuted underline decoration-dotted"
          >
            + Group
          </button>
        )}
      </div>
      {pickerOpen && (
        <div className="ml-1 flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-2">
          {groups.length === 0 && <span className="text-xs text-inkmuted">No groups yet — create one under "My groups".</span>}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onAddToGroup(entry.id, g.id)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-ink transition-colors hover:border-tag hover:text-tag"
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 transition-colors ${
        active ? 'bg-tag text-surface' : 'text-inkmuted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink">Nothing logged yet</p>
      <p className="max-w-[24ch] text-sm text-inkmuted">
        Tap the Log tab next time you spot something worth remembering.
      </p>
    </div>
  )
}
