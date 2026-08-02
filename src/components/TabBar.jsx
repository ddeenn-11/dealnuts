const TABS = [
  {
    id: 'add',
    label: 'Log',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.66-.9L9.6 4.1A2 2 0 0 1 11.26 3.2h1.48a2 2 0 0 1 1.66.9l.74 1a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
        <circle cx="12" cy="12.5" r="3.4" />
      </svg>
    ),
  },
  {
    id: 'browse',
    label: 'Finds',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4" width="7" height="7" rx="1.2" />
        <rect x="13.5" y="4" width="7" height="7" rx="1.2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
      </svg>
    ),
  },
  {
    id: 'compare',
    label: 'Compare',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v14" />
        <path d="M16 7v14" />
        <path d="M4.5 6 8 3l3.5 3" />
        <path d="M12.5 17.5 16 21l3.5-3.5" />
      </svg>
    ),
  },
]

export default function TabBar({ view, onChange }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active = view === tab.id
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tag ${
                  active ? 'text-tag' : 'text-inkmuted'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.icon(active)}
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
