import { useCallback, useEffect, useState } from 'react'
import { fetchSquad } from '../api/football'
import type { Position, SquadCoach, SquadPlayer } from '../types/squad'
import { nationalityFlag } from '../utils/nationality'

const GROUP_STYLE: Record<Position, { bg: string; label: string }> = {
  'вратар':        { bg: 'bg-yellow-700', label: 'Вратари' },
  'защитник':      { bg: 'bg-blue-800',   label: 'Защитници' },
  'полузащитник':  { bg: 'bg-green-800',  label: 'Полузащитници' },
  'нападател':     { bg: 'bg-red-800',    label: 'Нападатели' },
}

const GROUP_ORDER: Position[] = ['вратар', 'защитник', 'полузащитник', 'нападател']

const CURRENT_YEAR = new Date().getFullYear()

function PlayerCard({ p }: { p: SquadPlayer }) {
  const flag = nationalityFlag(p.nationality ?? null)
  const age = p.birthYear != null ? CURRENT_YEAR - p.birthYear : null
  const goals = p.goals ?? 0
  const assists = p.assists ?? 0
  const yellow = p.yellowCards ?? 0
  const red = p.redCards ?? 0

  return (
    <div className={`bg-[#1a3a1a] rounded-xl p-3 border border-[#2a5a2a] flex items-center gap-3 min-w-0 ${p.loanedTo ? 'opacity-60' : ''}`}>
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#0f2e0f] border-2 border-[#2a5a2a] flex items-center justify-center text-base font-bold text-green-400">
        {p.number ?? '—'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-semibold truncate leading-tight">
          {p.name}
          {p.captain && <span className="text-green-400 font-bold ml-1" title="Капитан">(K)</span>}
        </p>
        {p.nameLatin && (
          <p className="text-gray-500 text-xs truncate leading-tight">{p.nameLatin}</p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {age != null && <span className="text-gray-400 text-xs">{age} г.</span>}
          {flag && <span className="text-xs" title={p.nationality}>{flag}</span>}
          {(p.heightCm != null || p.weightKg != null) && (
            <span className="text-gray-500 text-xs">
              {p.heightCm != null ? `${p.heightCm} см` : ''}
              {p.heightCm != null && p.weightKg != null ? ' · ' : ''}
              {p.weightKg != null ? `${p.weightKg} кг` : ''}
            </span>
          )}
        </div>
        {p.loanedTo && (
          <p className="text-orange-400 text-xs mt-0.5">На заем: {p.loanedTo}</p>
        )}
        {(goals > 0 || assists > 0 || yellow > 0 || red > 0) && (
          <div className="flex gap-2 mt-1 text-xs text-gray-500">
            {goals > 0   && <span className="text-green-400">⚽ {goals}</span>}
            {assists > 0 && <span className="text-blue-400">🅰 {assists}</span>}
            {yellow > 0  && <span className="text-yellow-400">🟨 {yellow}</span>}
            {red > 0     && <span className="text-red-400">🟥 {red}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] py-3 px-2 text-center">
      <p className="text-2xl font-black text-green-300 leading-none">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

function SquadStats({ squad }: { squad: SquadPlayer[] }) {
  const active = squad.filter((p) => !p.loanedTo)
  if (active.length === 0) return null

  const bulgarians = active.filter((p) => p.nationality === 'Bulgaria').length
  const foreigners = active.filter((p) => p.nationality && p.nationality !== 'Bulgaria').length
  const ages = active
    .filter((p) => p.birthYear != null)
    .map((p) => CURRENT_YEAR - p.birthYear!)
  const avgAge = ages.length > 0 ? ages.reduce((sum, a) => sum + a, 0) / ages.length : null

  const heights = active.filter((p) => p.heightCm != null).map((p) => p.heightCm!)
  const avgHeight = heights.length > 0 ? heights.reduce((sum, h) => sum + h, 0) / heights.length : null

  return (
    <div className={`grid gap-2 ${avgHeight != null ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <StatTile label="Българи" value={String(bulgarians)} />
      <StatTile label="Чужденци" value={String(foreigners)} />
      <StatTile label="Ср. възраст" value={avgAge != null ? avgAge.toFixed(1) : '—'} />
      {avgHeight != null && <StatTile label="Ср. ръст" value={`${avgHeight.toFixed(0)} см`} />}
    </div>
  )
}

// Season-to-date leaderboards — includes loaned-out players (unlike
// SquadStats above), since this is about what they did this season, not
// who's currently training with the squad.
function TopStatsList({
  title,
  players,
  statKey,
  statLabel,
}: {
  title: string
  players: SquadPlayer[]
  statKey: 'goals' | 'yellowCards' | 'redCards'
  statLabel: string
}) {
  const ranked = players
    .filter((p) => (p[statKey] ?? 0) > 0)
    .sort((a, b) => (b[statKey] ?? 0) - (a[statKey] ?? 0))
    .slice(0, 5)
  if (ranked.length === 0) return null

  return (
    <div className="bg-[#1a3a1a] rounded-xl border border-[#2a5a2a] p-3">
      <h4 className="text-xs font-bold uppercase tracking-widest text-green-400 mb-2">{title}</h4>
      <div className="space-y-1">
        {ranked.map((p) => (
          <div key={p.id} className="flex justify-between text-xs text-gray-300">
            <span className="truncate">{p.number != null ? `${p.number}. ` : ''}{p.name}</span>
            <span className="text-green-300 font-semibold flex-shrink-0 ml-2">{p[statKey]} {statLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CoachCard({ c }: { c: SquadCoach }) {
  return (
    <div className="bg-[#1a3a1a] rounded-xl p-3 border border-[#2a5a2a] flex items-center gap-3 min-w-0">
      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#0f2e0f] border-2 border-[#2a5a2a] flex items-center justify-center text-base">
        👔
      </div>
      <div className="min-w-0">
        <p className="text-white text-sm font-semibold truncate leading-tight">{c.name}</p>
        {c.role && <p className="text-gray-500 text-xs truncate leading-tight">{c.role}</p>}
      </div>
    </div>
  )
}

export default function Squad() {
  const [players, setPlayers] = useState<SquadPlayer[]>([])
  const [coaches, setCoaches] = useState<SquadCoach[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((force = false) => {
    setLoading(true)
    fetchSquad({ force })
      .then((data) => {
        setPlayers(data.players)
        setCoaches(data.coaches)
        setUpdatedAt(data.updatedAt)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = new Map<Position, SquadPlayer[]>()
  for (const p of players) {
    grouped.set(p.position, [...(grouped.get(p.position) ?? []), p])
  }

  const empty = !loading && !error && players.length === 0 && coaches.length === 0

  return (
    <div className="p-4 space-y-6 pb-8">
      <div className="flex items-center justify-end gap-2">
        {updatedAt && <p className="text-xs text-gray-500">Обновено: {updatedAt}</p>}
        <button
          onClick={() => load(true)}
          disabled={loading}
          title="Опресни (пропуска кеша)"
          className="text-xs text-green-400 hover:text-white disabled:opacity-50 px-1.5 py-0.5 rounded border border-[#2a5a2a]"
        >
          ↻
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-4 text-red-300 text-sm">
          <p className="font-semibold mb-1">Грешка при зареждане</p>
          <p className="font-mono text-xs break-all">{error}</p>
        </div>
      )}

      {!loading && !error && <SquadStats squad={players} />}

      {empty && (
        <p className="text-center text-green-400 py-12 text-sm">
          Съставът все още не е попълнен — редактирайте <code className="bg-black/30 px-1 rounded">public/data/squad.json</code>.
        </p>
      )}

      {!loading && !error && coaches.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-white px-2 py-1 rounded mb-3 inline-block bg-gray-700">
            Треньорски щаб
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {coaches.map((c) => <CoachCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {!loading && !error && GROUP_ORDER.map((group) => {
        const members = grouped.get(group)
        if (!members || members.length === 0) return null
        const style = GROUP_STYLE[group]
        return (
          <div key={group}>
            <h3 className={`text-xs font-bold uppercase tracking-widest text-white px-2 py-1 rounded mb-3 inline-block ${style.bg}`}>
              {style.label}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map((p) => <PlayerCard key={p.id} p={p} />)}
            </div>
          </div>
        )
      })}

      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <TopStatsList title="Голмайстори" players={players} statKey="goals" statLabel="г" />
          <TopStatsList title="Жълти картони" players={players} statKey="yellowCards" statLabel="жк" />
          <TopStatsList title="Червени картони" players={players} statKey="redCards" statLabel="чк" />
        </div>
      )}
    </div>
  )
}
