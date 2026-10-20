import { useCallback, useEffect, useState } from 'react'
import { fetchHistoryIndex, fetchSeasonHistory } from '../api/football'
import type { HistoryEvent, HistoryIndex, HistoryMatch, LeaderboardEntry, SeasonHistory } from '../types/history'
import { teamNameBg } from '../utils/teamNames'

function seasonLabel(season: string): string {
  return season === 'current' ? 'Текущ сезон' : season.replace('-', '/')
}

// Sorts minute strings for the event timeline. Most are "45", "90+3"; a few
// older seasons only have "1п"/"2п" (half known, exact minute isn't) or "??"
// (unknown) — approximated into the right neighborhood rather than dropped.
function minuteSortKey(minute: string): number {
  const plus = minute.match(/^(\d+)\+(\d+)$/)
  if (plus) return Number(plus[1]) + Number(plus[2]) / 100
  const plain = minute.match(/^\d+$/)
  if (plain) return Number(minute)
  const half = minute.match(/^(\d)п$/)
  if (half) return half[1] === '1' ? 22.5 : 67.5
  return Infinity
}

type Result = 'win' | 'draw' | 'loss'

function matchResult(m: HistoryMatch): Result {
  const [a, b] = m.score.split(':').map(Number)
  const [ours, theirs] = m.isHome ? [a, b] : [b, a]
  if (ours > theirs) return 'win'
  if (ours < theirs) return 'loss'
  return 'draw'
}

const RESULT_STYLE: Record<Result, string> = {
  win: 'text-green-400',
  draw: 'text-yellow-400',
  loss: 'text-red-400',
}

const RESULT_BORDER: Record<Result, string> = {
  win: 'border-green-700',
  draw: 'border-yellow-700',
  loss: 'border-red-700',
}

function EventRow({ e }: { e: HistoryEvent }) {
  if (e.type === 'goal') {
    return (
      <div className={`flex items-baseline gap-2 text-xs ${e.forUs ? 'text-green-300' : 'text-gray-400'}`}>
        <span className="text-gray-500 w-8 flex-shrink-0">{e.minute}'</span>
        <span>
          ⚽ {e.scorer ?? '—'}
          {e.isPenalty && ' (д)'}
          {e.isOwnGoal && ' (авт.)'}
          {e.assist && <span className="text-gray-500"> (асистенция: {e.assist})</span>}
        </span>
      </div>
    )
  }
  if (e.type === 'card') {
    return (
      <div className={`flex items-baseline gap-2 text-xs ${e.forUs ? 'text-gray-200' : 'text-gray-500'}`}>
        <span className="text-gray-500 w-8 flex-shrink-0">{e.minute}'</span>
        <span>{e.card === 'red' ? '🟥' : '🟨'} {e.player ?? '—'}</span>
      </div>
    )
  }
  return (
    <div className={`flex items-baseline gap-2 text-xs ${e.forUs ? 'text-gray-200' : 'text-gray-500'}`}>
      <span className="text-gray-500 w-8 flex-shrink-0">{e.minute}'</span>
      <span>🔄 {e.in ?? '—'} <span className="text-gray-500">за</span> {e.out ?? '—'}</span>
    </div>
  )
}

function MatchRow({ m, expanded, onToggle }: { m: HistoryMatch; expanded: boolean; onToggle: () => void }) {
  const result = matchResult(m)
  const sortedEvents = [...m.events].sort((a, b) => minuteSortKey(a.minute) - minuteSortKey(b.minute))

  return (
    <div className={`rounded-xl border overflow-hidden bg-[#0f2e0f] ${RESULT_BORDER[result]}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{m.round}{m.date && ` · ${m.date}`}</p>
          <p className="text-sm text-gray-200 truncate">
            {m.isHome ? 'у дома' : 'гост'} {m.isHome ? '–' : '@'} {teamNameBg(m.opponent)}
          </p>
        </div>
        <span className={`text-lg font-black flex-shrink-0 ${RESULT_STYLE[result]}`}>{m.score}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-[#2a5a2a] space-y-2">
          <p className="text-xs text-gray-500">
            {[m.venue, m.city].filter(Boolean).join(', ')}
            {m.referee && ` · Съдия: ${m.referee}`}
            {m.attendance != null && ` · Публика: ${m.attendance}`}
          </p>
          {sortedEvents.length > 0 ? (
            <div className="space-y-1">
              {sortedEvents.map((e, i) => <EventRow key={i} e={e} />)}
            </div>
          ) : (
            <p className="text-xs text-gray-600">Няма данни за събития в мача.</p>
          )}
        </div>
      )}
    </div>
  )
}

function LeaderboardList({ title, rows, statLabel, statKey }: {
  title: string
  rows: LeaderboardEntry[]
  statLabel: string
  statKey: 'goals' | 'assists' | 'yellowCards'
}) {
  if (rows.length === 0) return null
  return (
    <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] p-3">
      <h4 className="text-xs font-bold uppercase tracking-widest text-green-400 mb-2">{title}</h4>
      <div className="space-y-1">
        {rows.slice(0, 5).map((r, i) => (
          <div key={i} className="flex justify-between text-xs text-gray-300">
            <span className="truncate">{r.number != null ? `${r.number}. ` : ''}{r.name}</span>
            <span className="text-green-300 font-semibold flex-shrink-0 ml-2">{String(r[statKey])} {statLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function History() {
  const [index, setIndex] = useState<HistoryIndex | null>(null)
  const [season, setSeason] = useState<string | null>(null)
  const [seasonData, setSeasonData] = useState<SeasonHistory | null>(null)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [loadingSeason, setLoadingSeason] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    fetchHistoryIndex()
      .then((d) => { setIndex(d); setSeason(d.seasons[0]?.season ?? null) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingIndex(false))
  }, [])

  const loadSeason = useCallback((s: string) => {
    setLoadingSeason(true)
    setExpanded(null)
    fetchSeasonHistory(s)
      .then(setSeasonData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingSeason(false))
  }, [])

  useEffect(() => { if (season) loadSeason(season) }, [season, loadSeason])

  return (
    <div className="p-4 space-y-4 pb-8">
      <span className="text-xs text-gray-500 uppercase tracking-widest">История</span>

      {error && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-4 text-red-300 text-sm">
          <p className="font-semibold mb-1">Грешка при зареждане</p>
          <p className="font-mono text-xs break-all">{error}</p>
        </div>
      )}

      {loadingIndex && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      )}

      {index && (
        <>
          {/* All-time record */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] py-2">
              <p className="text-lg font-black text-white leading-none">{index.allTime.played}</p>
              <p className="text-[10px] text-gray-400 mt-1">Мачове</p>
            </div>
            <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] py-2">
              <p className="text-lg font-black text-green-400 leading-none">{index.allTime.wins}</p>
              <p className="text-[10px] text-gray-400 mt-1">Победи</p>
            </div>
            <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] py-2">
              <p className="text-lg font-black text-yellow-400 leading-none">{index.allTime.draws}</p>
              <p className="text-[10px] text-gray-400 mt-1">Равни</p>
            </div>
            <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] py-2">
              <p className="text-lg font-black text-red-400 leading-none">{index.allTime.losses}</p>
              <p className="text-[10px] text-gray-400 mt-1">Загуби</p>
            </div>
          </div>

          {/* Season picker */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
            {index.seasons.map((s) => (
              <button
                key={s.season}
                onClick={() => setSeason(s.season)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  season === s.season ? 'bg-[#1a5c1a] text-white' : 'bg-[#0f2e0f] text-green-400 border border-[#2a5a2a]'
                }`}
              >
                {seasonLabel(s.season)}
              </button>
            ))}
          </div>
        </>
      )}

      {loadingSeason && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      )}

      {!loadingSeason && seasonData && (
        <>
          {/* Season record */}
          <p className="text-center text-sm text-gray-300">
            {seasonData.summary.played} мача · {seasonData.summary.wins}п {seasonData.summary.draws}р {seasonData.summary.losses}з ·
            {' '}{seasonData.summary.goalsFor}:{seasonData.summary.goalsAgainst}
          </p>

          {/* Leaderboards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <LeaderboardList title="Голмайстори" rows={seasonData.topScorers} statLabel="г" statKey="goals" />
            <LeaderboardList title="Асистенции" rows={seasonData.topAssisters} statLabel="а" statKey="assists" />
            <LeaderboardList title="Картони" rows={seasonData.mostCarded} statLabel="жк" statKey="yellowCards" />
          </div>

          {/* Match list */}
          <div className="space-y-2">
            {seasonData.matches.map((m, i) => (
              <MatchRow key={i} m={m} expanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
