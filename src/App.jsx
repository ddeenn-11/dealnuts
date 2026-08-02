import { useState } from 'react'
import TabBar from './components/TabBar.jsx'
import AddEntry from './screens/AddEntry.jsx'
import Browse from './screens/Browse.jsx'
import Compare from './screens/Compare.jsx'
import ItemDetail from './screens/ItemDetail.jsx'

export default function App() {
  const [view, setView] = useState('add')
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const [compareIds, setCompareIds] = useState([])

  function bump() {
    setRefreshKey((k) => k + 1)
  }

  function openEntry(id) {
    setSelectedEntryId(id)
    setView('detail')
  }

  function handleTabChange(tab) {
    setCompareIds([])
    setView(tab)
  }

  return (
    <div className="min-h-full">
      <main>
        {view === 'add' && (
          <AddEntry
            onSaved={() => {
              bump()
              setView('browse')
            }}
          />
        )}

        {view === 'browse' && (
          <Browse
            refreshKey={refreshKey}
            onOpenEntry={openEntry}
            onCompareSelected={(ids) => {
              setCompareIds(ids)
              setView('compare')
            }}
          />
        )}

        {view === 'compare' && (
          <Compare refreshKey={refreshKey} presetIds={compareIds} onOpenEntry={openEntry} />
        )}

        {view === 'detail' && selectedEntryId && (
          <ItemDetail
            entryId={selectedEntryId}
            onBack={() => setView('browse')}
            onDeleted={() => {
              bump()
              setView('browse')
            }}
            onChanged={bump}
          />
        )}
      </main>

      <TabBar view={view === 'detail' ? 'browse' : view} onChange={handleTabChange} />
    </div>
  )
}
