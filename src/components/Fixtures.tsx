import { useCallback, useEffect, useState } from 'react'
import type { Fixture } from '../types/football'
import { fetchFixtures, fetchFixturesMeta, fetchSquad, fixtureState, TEAM_ID } from '../api/football'
import { teamNameBg } from '../utils/teamNames'
import { useLiveMatch } from '../hooks/useLiveMatch'
import type { LineupPlayer, MatchIncident, MatchLineups } from '../api/providers/sportscore'
import type { SquadPlayer } from '../types/squad'

const OUR_TEAM_ID = Number(TEAM_ID)

// ---- helpers ----

function parseDate(iso: string) {
  return new Date(iso)
}

function formatDate(d: Date) {
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'short', weekday: 'short' })
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}

type Result = 'win' | 'draw' | 'loss' | 'upcoming' | 'live' | 'cancelled'

function getResult(f: Fixture): Result {
  const state = fixtureState(f.fixture.status.short)
  if (state === 'cancelled') return 'cancelled'
  if (state === 'live') return 'live'
  if (state === 'upcoming') return 'upcoming'

  const weHome = f.teams.home.id === OUR_TEAM_ID
  const ourScore = weHome ? f.goals.home : f.goals.away
  const theirScore = weHome ? f.goals.away : f.goals.home
  if (ourScore == null || theirScore == null) return 'upcoming'
  if (ourScore > theirScore) return 'win'
  if (ourScore < theirScore) return 'loss'
  return 'draw'
}

const RESULT_STYLE: Record<Result, string> = {
  win:       'text-green-400',
  draw:      'text-yellow-400',
  loss:      'text-red-400',
  upcoming:  'text-gray-400',
  live:      'text-red-400',
  cancelled: 'text-gray-500',
}

function incidentIcon(inc: MatchIncident): string {
  if (inc.is_goal) return '⚽'
  if (inc.is_sub) return '🔄'
  if (inc.is_card) return inc.type.toLowerCase().includes('red') ? '🟥' : '🟨'
  return '•'
}

function incidentText(inc: MatchIncident, resolveName: (latinName: string) => string): string {
  if (inc.is_sub) return `${resolveName(inc.player_in ?? '?')} ↳ ${resolveName(inc.player_out ?? '?')}`
  if (inc.is_goal) return `${resolveName(inc.player)} (${inc.home_score ?? 0}:${inc.away_score ?? 0})`
  return resolveName(inc.player)
}

// SportScore only gives player names in Latin script, and there's no free
// source for opponents' Cyrillic names — but our OWN players are already
// hand-maintained in squad.json with Cyrillic names, and increasingly with
// a `nameLatin` too (backfilled from live match data). SportScore's own
// casing/punctuation is inconsistent match to match (seen live: "celso
// sidney" lowercase, "Ivan·Tasev" with an interpunct instead of a space,
// "L. Squadrone" abbreviated) so comparisons are normalized, with a
// surname-only fallback for abbreviated first names.
function normalizeLatin(s: string): string {
  return s.toLowerCase().replace(/[·.-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function findBySquadLatinName(latinName: string, squad: SquadPlayer[]): SquadPlayer | undefined {
  const wanted = normalizeLatin(latinName)
  if (!wanted) return undefined
  const exact = squad.find((p) => p.nameLatin && normalizeLatin(p.nameLatin) === wanted)
  if (exact) return exact
  const wantedLast = wanted.split(' ').pop()
  if (!wantedLast || wantedLast.length <= 2) return undefined
  return squad.find((p) => p.nameLatin && normalizeLatin(p.nameLatin).split(' ').pop() === wantedLast)
}

// Primary: direct match against squad.json's nameLatin — robust to a
// player's shirt number changing mid-season (confirmed to happen live, see
// docs/plans/2026-08-live-match-and-push.md: Петър Андреев wore #18 in a
// real match despite squad.json listing #2). Falls back to a jersey-number
// join via this match's own lineup only for players nameLatin isn't on
// file for yet. Falls back to the raw Latin name if neither resolves.
function resolveOurPlayerName(
  latinName: string,
  squad: SquadPlayer[],
  lineups: MatchLineups | null,
  weHome: boolean,
): string {
  const byName = findBySquadLatinName(latinName, squad)
  if (byName) return byName.name

  if (lineups) {
    const wanted = normalizeLatin(latinName)
    const roster = weHome ? [...lineups.home_xi, ...lineups.home_subs] : [...lineups.away_xi, ...lineups.away_subs]
    const found = roster.find((p) => normalizeLatin(p.name) === wanted)
    const byNumber = found && squad.find((p) => p.number === found.number)
    if (byNumber) return byNumber.name
  }

  return latinName
}

function LineupColumn({
  title,
  formation,
  xi,
  subs,
  highlight,
  squad,
}: {
  title: string
  formation: string | null
  xi: LineupPlayer[]
  subs: LineupPlayer[]
  highlight: boolean
  squad: SquadPlayer[]
}) {
  const displayName = (p: LineupPlayer) =>
    highlight ? (findBySquadLatinName(p.name, squad)?.name ?? squad.find((s) => s.number === p.number)?.name ?? p.name) : p.name
  return (
    <div>
      <p className={`font-bold mb-1 truncate ${highlight ? 'text-green-300' : 'text-gray-200'}`}>
        {title} {formation && <span className="text-gray-500 font-normal">({formation})</span>}
      </p>
      <ul className="space-y-0.5">
        {xi.map((p) => (
          <li key={p.number} className="text-gray-300 truncate">
            <span className="text-gray-500">{p.number}</span> {displayName(p)}
            {p.captain && <span className="text-yellow-400"> (K)</span>}
          </li>
        ))}
      </ul>
      {subs.length > 0 && (
        <p className="text-gray-500 mt-1.5 truncate">Резерви: {subs.map((p) => displayName(p)).join(', ')}</p>
      )}
    </div>
  )
}

const RESULT_BADGE: Record<Result, string> = {
  win:       'bg-green-900/50 text-green-300 border-green-700',
  draw:      'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  loss:      'bg-red-900/50 text-red-300 border-red-700',
  upcoming:  'bg-[#0f2e0f] text-gray-400 border-[#2a5a2a]',
  live:      'bg-red-900/40 text-red-300 border-red-600',
  cancelled: 'bg-gray-900/50 text-gray-500 border-gray-700',
}

// ---- card ----

function MatchCard({ f }: { f: Fixture }) {
  const date = parseDate(f.fixture.date)
  const result = getResult(f)
  const weHome = f.teams.home.id === OUR_TEAM_ID
  const us = weHome ? f.teams.home : f.teams.away
  const them = weHome ? f.teams.away : f.teams.home
  const isFinished = result === 'win' || result === 'draw' || result === 'loss'
  // League matches show their round; cup matches (no round) their competition.
  const stage = f.league.round ? `Кръг ${f.league.round}` : f.league.name
  const isCup = !f.league.round

  return (
    <div className={`rounded-xl border overflow-hidden ${RESULT_BADGE[result]}`}>
      {/* top bar: date + round (or cup name) */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-black/20 text-xs">
        <span className={isCup ? 'text-[#c9a227] font-semibold' : 'text-gray-400'}>{stage}</span>
        <span className="text-gray-400">{formatDate(date)}</span>
      </div>

      {/* match row */}
      <div className="flex items-center px-3 py-3 gap-2">

        {/* Our team */}
        <div className={`flex-1 flex items-center gap-1.5 min-w-0 ${weHome ? 'order-1 flex-row-reverse text-right' : 'order-3'}`}>
          {us.logo && (
            <img src={us.logo} alt="" className="h-5 w-5 flex-shrink-0 object-contain" loading="lazy" />
          )}
          <div className="min-w-0">
            <p className="font-black uppercase tracking-wide text-white text-xs sm:text-sm leading-tight truncate">
              ЧЕРНО МОРЕ
            </p>
            <p className="text-gray-500 text-xs">Варна</p>
          </div>
        </div>

        {/* Score / time */}
        <div className="order-2 flex flex-col items-center min-w-[72px]">
          {isFinished ? (
            // Home/away order, matching the team-name columns' home-left /
            // away-right positioning above — NOT ourScore/theirScore, which
            // would read backwards whenever we're the away side (bug: showed
            // e.g. "1 – 4" for a 4-1 loss because the away team's block sits
            // on the right but the score kept "us" first).
            <span className={`text-2xl font-black leading-none ${RESULT_STYLE[result]}`}>
              {f.goals.home} – {f.goals.away}
            </span>
          ) : result === 'live' ? (
            <>
              <span className="text-2xl font-black leading-none text-red-400 animate-pulse">
                {f.goals.home ?? 0} – {f.goals.away ?? 0}
              </span>
              <span className="text-xs mt-1 font-semibold text-red-400">На живо</span>
            </>
          ) : result === 'cancelled' ? (
            <span className="text-sm text-gray-500">Отм.</span>
          ) : f.fixture.timeTBD ? (
            <>
              <span className="text-xs font-semibold text-gray-500">Часът предстои</span>
              <span className="text-xs text-gray-600 mt-0.5">{formatDate(date)}</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-gray-400">{formatTime(date)}</span>
              <span className="text-xs text-gray-600 mt-0.5">{formatDate(date)}</span>
            </>
          )}
        </div>

        {/* Opponent */}
        <div className={`flex-1 flex items-center gap-1.5 min-w-0 ${weHome ? 'order-3' : 'order-1 flex-row-reverse text-right'}`}>
          {them.logo && (
            <img src={them.logo} alt="" className="h-5 w-5 flex-shrink-0 object-contain" loading="lazy" />
          )}
          <p className="text-gray-200 text-xs sm:text-sm font-medium leading-tight truncate">
            {teamNameBg(them.name)}
          </p>
        </div>

      </div>
    </div>
  )
}

// ---- main component ----

// Bulgarian league: season starts July → season is YYYY/YYYY+1
function currentSeason(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1 // 1–12
  return m >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}

// Return [seasonStart, seasonEnd] for the currently active season
function seasonRange(): [Date, Date] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const startYear = m >= 7 ? y : y - 1
  return [
    new Date(startYear, 6, 1),       // July 1
    new Date(startYear + 1, 5, 30),  // June 30 next year
  ]
}

function inCurrentSeason(iso: string): boolean {
  const d = new Date(iso)
  const [start, end] = seasonRange()
  return d >= start && d <= end
}

type Tab = 'upcoming' | 'results'

export default function Fixtures() {
  const [all, setAll] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [meta, setMeta] = useState<{ updatedAt: string } | null>(null)
  const [showLineups, setShowLineups] = useState(false)
  const [squad, setSquad] = useState<SquadPlayer[]>([])

  const load = useCallback((force = false) => {
    setLoading(true)
    fetchFixtures({ force })
      .then(setAll)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchFixturesMeta().then(setMeta).catch(() => setMeta(null)) }, [])
  // For translating our own players' Latin names (from SportScore's live
  // data) to the Cyrillic names already hand-maintained in squad.json — see
  // resolveOurPlayerName().
  useEffect(() => {
    fetchSquad()
      .then(({ players }) => setSquad(players))
      .catch(() => setSquad([]))
  }, [])

  const now = new Date()

  const thisSeason = all.filter((f) => inCurrentSeason(f.fixture.date))

  const upcoming = thisSeason
    .filter((f) => fixtureState(f.fixture.status.short) === 'upcoming')
    .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime())

  const results = thisSeason
    .filter((f) => fixtureState(f.fixture.status.short) === 'finished')
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime())

  const live = thisSeason.find((f) => fixtureState(f.fixture.status.short) === 'live')

  // Whichever fixture is nearest to "now" — feeds useLiveMatch, which only
  // actually polls once that match is inside its own live window (10 min
  // pre-kickoff to ~3h after); everything else is a no-op, not a real
  // request, so it's safe to hand it any nearby match at any time.
  const liveCandidate = thisSeason
    .filter((f) => f.fixture.slug)
    .reduce<Fixture | null>((closest, f) => {
      if (!closest) return f
      const nowMs = now.getTime()
      const d = Math.abs(new Date(f.fixture.date).getTime() - nowMs)
      const closestD = Math.abs(new Date(closest.fixture.date).getTime() - nowMs)
      return d < closestD ? f : closest
    }, null)
  const { detail: liveDetail } = useLiveMatch(liveCandidate)
  const isLiveDetail = liveDetail && (liveDetail.match.status === 'live' || liveDetail.match.status === 'in_play')
  // Once SportScore marks the match finished, lineups should disappear along
  // with the live banner — otherwise the last-polled detail (still holding
  // `lineups.confirmed`) lingers in state and keeps rendering them for as
  // long as this fixture remains the nearest one to "now" (see liveCandidate
  // above), i.e. until the next match approaches.
  const lineups = liveDetail && liveDetail.match.status !== 'finished' ? liveDetail.match.lineups : null
  // liveCandidate.teams.{home,away} and liveDetail.match.{home,away} are the
  // same match from the same source, in the same order — so this tells us
  // which `side` in an incident is Cherno More.
  const weHomeLive = liveCandidate?.teams.home.id === OUR_TEAM_ID

  const shown = tab === 'upcoming' ? upcoming : results
  const season = currentSeason()

  return (
    <div className="p-4 pb-8 space-y-4">

      {/* Season label */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-widest">Първа лига и купи</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-green-400 bg-[#0f2e0f] border border-[#2a5a2a] px-2 py-0.5 rounded">
            Сезон {season}
          </span>
          <button
            onClick={() => load(true)}
            disabled={loading}
            title="Опресни (пропуска кеша)"
            className="text-xs text-green-400 hover:text-white disabled:opacity-50 px-1.5 py-0.5 rounded border border-[#2a5a2a]"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Live banner — prefers the freshly-polled match detail (30s cadence,
          only while inside the live window) over the coarser cached fixture
          list (10 min TTL), falling back to the latter until the first poll
          lands. */}
      {(live || isLiveDetail) && (
        <div className="bg-red-900/40 border border-red-600 rounded-xl px-4 py-3 space-y-2 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-red-400 text-lg">🔴</span>
            <div>
              <p className="text-red-300 text-xs font-bold uppercase tracking-wide">
                На живо{isLiveDetail && liveDetail.match.live_minute != null ? ` · ${liveDetail.match.live_minute}'` : ''}
              </p>
              <p className="text-white text-sm font-semibold">
                {isLiveDetail
                  ? `${teamNameBg(liveDetail.match.home)} ${liveDetail.match.home_score ?? 0} – ${liveDetail.match.away_score ?? 0} ${teamNameBg(liveDetail.match.away)}`
                  : live && `${teamNameBg(live.teams.home.name)} ${live.goals.home ?? 0} – ${live.goals.away ?? 0} ${teamNameBg(live.teams.away.name)}`}
              </p>
            </div>
          </div>
          {isLiveDetail && liveDetail.match.incidents.length > 0 && (
            <ul className="text-xs space-y-0.5 pl-8">
              {[...liveDetail.match.incidents].reverse().map((inc, i) => {
                const isUs = (inc.side === 'home') === weHomeLive
                const resolveName = (latinName: string) =>
                  isUs
                    ? resolveOurPlayerName(latinName, squad, liveDetail.match.lineups, weHomeLive === true)
                    : latinName
                return (
                  <li key={i} className={isUs ? 'text-white font-semibold' : 'text-red-200/70'}>
                    {inc.time}&apos; {incidentIcon(inc)} {incidentText(inc, resolveName)}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Lineups — shown once SportScore confirms them (typically ~60 min
          pre-kickoff), independent of live/upcoming status, so they appear
          before kickoff too, not just once the match goes live. */}
      {lineups?.confirmed && liveDetail && (
        <div className="rounded-xl border border-[#2a5a2a] overflow-hidden">
          <button
            onClick={() => setShowLineups((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0f2e0f] text-left"
          >
            <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
              Стартови състави
            </span>
            <span className="text-green-400 text-xs">{showLineups ? '▲' : '▼'}</span>
          </button>
          {showLineups && (
            <div className="grid grid-cols-2 gap-3 p-3 text-xs">
              <LineupColumn
                title={teamNameBg(liveDetail.match.home)}
                formation={lineups.home_formation}
                xi={lineups.home_xi}
                subs={lineups.home_subs}
                highlight={weHomeLive === true}
                squad={squad}
              />
              <LineupColumn
                title={teamNameBg(liveDetail.match.away)}
                formation={lineups.away_formation}
                xi={lineups.away_xi}
                subs={lineups.away_subs}
                highlight={weHomeLive === false}
                squad={squad}
              />
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden border border-[#2a5a2a]">
        {(['upcoming', 'results'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'bg-[#1a5c1a] text-white' : 'bg-[#0f2e0f] text-green-400'
            }`}
          >
            {t === 'upcoming' ? `Предстоящи (${upcoming.length})` : `Резултати (${results.length})`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-600 rounded-lg p-4 text-red-300 text-sm">
          <p className="font-semibold mb-1">Грешка при зареждане</p>
          <p className="font-mono text-xs break-all">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && shown.length === 0 && (
        <p className="text-center text-green-400 py-8 text-sm">Няма намерени мачове.</p>
      )}

      {/* Match list */}
      {!loading && !error && (
        <div className="space-y-3">
          {shown.map((f, i) => {
            const matchDate = new Date(f.fixture.date)
            const isNextUp = tab === 'upcoming' && i === 0
            const isToday = matchDate.toDateString() === now.toDateString()
            return (
              <div key={f.fixture.id}>
                {isNextUp && (
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-px flex-1 bg-[#2a5a2a]" />
                    <span className="text-xs text-green-400 font-semibold px-1">
                      {isToday ? 'Днес' : 'Следващ мач'}
                    </span>
                    <div className="h-px flex-1 bg-[#2a5a2a]" />
                  </div>
                )}
                <MatchCard f={f} />
              </div>
            )
          })}
        </div>
      )}

      {/* Result legend */}
      {!loading && !error && tab === 'results' && results.length > 0 && (
        <div className="flex gap-4 justify-center text-xs text-gray-500 pt-2">
          <span className="flex items-center gap-1"><span className="text-green-400 font-bold">■</span> Победа</span>
          <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">■</span> Равен</span>
          <span className="flex items-center gap-1"><span className="text-red-400 font-bold">■</span> Загуба</span>
        </div>
      )}

      {meta && (
        <p className="text-center text-xs text-gray-600 pt-2">
          Обновено {meta.updatedAt}
        </p>
      )}
    </div>
  )
}
