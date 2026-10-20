import { useState } from 'react'
import Fixtures from './components/Fixtures'
import Header from './components/Header'
import History from './components/History'
import News from './components/News'
import Squad from './components/Squad'
import Standings from './components/Standings'

type Tab = 'fixtures' | 'standings' | 'squad' | 'history' | 'news'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'fixtures', label: 'Мачове', icon: '⚽' },
  { id: 'standings', label: 'Класиране', icon: '📊' },
  { id: 'squad', label: 'Отбор', icon: '👕' },
  { id: 'history', label: 'История', icon: '📜' },
  { id: 'news', label: 'Новини', icon: '📰' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('fixtures')

  return (
    <div className="flex flex-col min-h-dvh max-w-lg mx-auto">
      <Header />

      <main className="flex-1 overflow-y-auto">
        {activeTab === 'fixtures' && <Fixtures />}
        {activeTab === 'standings' && <Standings />}
        {activeTab === 'squad' && <Squad />}
        {activeTab === 'history' && <History />}
        {activeTab === 'news' && <News />}
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-[#0f2e0f] border-t border-[#2a5a2a] flex safe-bottom">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-green-400 border-t-2 border-green-400 -mt-px'
                : 'text-gray-500'
            }`}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
