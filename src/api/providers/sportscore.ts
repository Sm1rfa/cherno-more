// SportScore (sportscore.com) — free, key-free, CORS-enabled public API,
// fronting real data (images served from img.thesports.com). Verified
// against our own manually-parsed fixtures/standings before wiring this in —
// every number matched exactly.
//
// Free tier condition: a visible "Powered by SportScore" dofollow link
// somewhere in the app at all times (see Header.tsx) — see
// https://sportscore.com/developers/terms/. No API key required.
//
// This is the primary live source. Falls back to goal.bg (if configured),
// then to the manual public/data/*.json dataset, on any failure — see
// ../football.ts.

import { OUR_TEAM_ID } from '../constants'
import { fetchLeagueRoundsByDate } from './manual'
import type { Fixture, Standing } from '../../types/football'

const BASE_URL = 'https://sportscore.com'
const TEAM_SLUG = 'cherno-more-varna'
const COMPETITION_SLUG = 'bulgarian-first-league'
const LEAGUE_NAME = 'Bulgarian First League'
const OUR_TEAM_NAME = 'Cherno More Varna'

// SportScore competition name -> label on the match card. Anything not listed
// (friendlies) is left out of the Fixtures tab. Keep in sync with
// DEFAULT_COMPETITIONS in public/push/check-match.php.
const COMPETITION_LABELS: Record<string, string> = {
  [LEAGUE_NAME]: 'Първа лига',
  'Bulgarian Cup': 'Купа на България',
  'BP Cup': 'Bulgarian Pro Cup',
}
// Cup matches have no round; their fixture ids start here so they never
// collide with league round numbers (fixture.id doubles as a React key).
const CUP_ID_BASE = 1000

/** "2026-11-02T15:00:00+00:00" -> "2026-11-02", in Bulgarian local time. */
function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Sofia' })
}

const teamIds = new Map<string, number>([[OUR_TEAM_NAME, OUR_TEAM_ID]])
let nextTeamId = OUR_TEAM_ID + 1
function idFor(name: string): number {
  let id = teamIds.get(name)
  if (id == null) {
    id = nextTeamId++
    teamIds.set(name, id)
  }
  return id
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json() as Promise<T>
}

// ---- Fixtures ----

interface SportScoreMatch {
  home: string
  away: string
  home_logo: string
  away_logo: string
  home_score: string | number | null
  away_score: string | number | null
  status: string
  status_text: string
  time: string
  competition: string
  slug?: string
  /** e.g. "/football/match/levski-sofia-vs-cherno-more-varna/zp5rzghgew6jq82/" — slug, then upstream match id. */
  url?: string
}

// "Cherno More Varna" -> "cherno-more-varna" — matches SportScore's own
// slugs exactly (verified against TEAM_SLUG and a live /api/widget/match/
// URL for "CSKA Sofia" vs "Cherno More Varna"). Only a last resort — see
// matchSlug().
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Prefer the slug from SportScore's own `url` — its team order doesn't always
// follow home/away (Arda at home is "cherno-more-varna-vs-arda"). Note that
// a slug is NOT unique per match: every meeting of the same two teams shares
// it, so /api/widget/match/ can answer with a different game — see the
// kickoff guard in fetchMatchDetail().
function matchSlug(m: SportScoreMatch): string {
  return m.slug ?? m.url?.split('/')[3] ?? `${slugify(m.home)}-vs-${slugify(m.away)}`
}

interface TeamResponse {
  team: { name: string; logo: string; slug: string }
  count: number
  matches: SportScoreMatch[]
}

function toShortStatus(status: string): string {
  switch (status) {
    case 'finished':
      return 'FINISHED'
    case 'live':
    case 'in_play':
      return 'LIVE'
    case 'cancelled':
    case 'postponed':
    case 'abandoned':
      return 'CANCELLED'
    default: // 'upcoming'
      return 'SCHEDULED'
  }
}

function toNumber(v: string | number | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export async function fetchFixtures(): Promise<Fixture[]> {
  const [data, roundsByDate] = await Promise.all([
    fetchJson<TeamResponse>(`/api/v1/team/?sport=football&slug=${TEAM_SLUG}&limit=50`),
    // Real round numbers from public/data/fixtures.json (refreshed from
    // bulgarian-football.com) — empty if that file can't be read.
    fetchLeagueRoundsByDate().catch(() => new Map<string, number>()),
  ])

  const matches = data.matches
    .filter((m) => m.competition in COMPETITION_LABELS)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  let leagueIndex = 0
  let cupIndex = 0
  return matches.map((m) => {
    const homeGoals = toNumber(m.home_score)
    const awayGoals = toNumber(m.away_score)
    const played = homeGoals != null && awayGoals != null
    const draw = played && homeGoals === awayGoals
    const isLeague = m.competition === LEAGUE_NAME
    // SportScore exposes no round number. Prefer the official one for that
    // date; otherwise fall back to chronological order among league matches,
    // which is wrong once the BFU reschedules rounds out of order.
    let round: number | null = null
    if (isLeague) {
      leagueIndex += 1
      round = roundsByDate.get(localDate(m.time)) ?? leagueIndex
    }
    return {
      fixture: {
        id: round ?? CUP_ID_BASE + ++cupIndex,
        date: m.time,
        status: { short: toShortStatus(m.status), elapsed: null },
        slug: matchSlug(m),
      },
      league: { name: COMPETITION_LABELS[m.competition], round: round == null ? '' : String(round) },
      teams: {
        home: { id: idFor(m.home), name: m.home, logo: m.home_logo, winner: played ? (draw ? null : homeGoals! > awayGoals!) : null },
        away: { id: idFor(m.away), name: m.away, logo: m.away_logo, winner: played ? (draw ? null : awayGoals! > homeGoals!) : null },
      },
      goals: { home: homeGoals, away: awayGoals },
    }
  })
}

// ---- Standings ----

interface SportScoreStandingRow {
  pos: number
  team: string
  team_logo: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
  promo_color: string | null
  promo_name: string | null
}

interface StandingsResponse {
  tables: Array<{ group: string; rows: SportScoreStandingRow[] }>
}

export async function fetchStandings(): Promise<Standing[]> {
  const data = await fetchJson<StandingsResponse>(`/api/v1/standings/?sport=football&slug=${COMPETITION_SLUG}`)
  const rows = data.tables[0]?.rows ?? []
  return rows.map((r) => ({
    rank: r.pos,
    team: { id: idFor(r.team), name: r.team, logo: r.team_logo },
    points: r.pts,
    goalsDiff: r.gd,
    all: {
      played: r.p,
      win: r.w,
      draw: r.d,
      lose: r.l,
      goals: { for: r.gf, against: r.ga },
    },
    form: null,
    description: r.promo_name,
    color: r.promo_color,
  }))
}

// ---- Match detail (live events) ----
//
// SportScore-only, so this bypasses football.ts's fallback orchestration —
// callers import it directly and only use it once a Fixture has a `slug`.
// Shape confirmed live on 2026-08-30 against a real in-play match
// (Leeds United vs Brentford, 2nd half): incidents/stats/lineups below match
// that real response exactly. `player` is empty on substitution incidents
// (use player_in/player_out instead); goal incidents carry the running
// score in home_score/away_score. type/type_id seen so far: "Goal"/1,
// "Yellow card"/3, "Substitution"/9 — other type_ids (red card, penalty,
// etc.) are plausible but unconfirmed.

export interface MatchIncident {
  time: number
  type: string
  type_id: number
  side: 'home' | 'away'
  player: string
  is_goal?: boolean
  is_card?: boolean
  is_sub?: boolean
  player_in?: string
  player_out?: string
  home_score?: number
  away_score?: number
}

export interface MatchStat {
  label: string
  home: number
  away: number
  home_pct: number
  away_pct: number
  suffix: string
}

export interface LineupPlayer {
  name: string
  number: number
  position: string
  captain: boolean
  rating: string
}

export interface MatchLineups {
  home_formation: string | null
  away_formation: string | null
  home_coach: string | null
  away_coach: string | null
  confirmed: boolean
  home_xi: LineupPlayer[]
  home_subs: LineupPlayer[]
  away_xi: LineupPlayer[]
  away_subs: LineupPlayer[]
}

export interface MatchDetail {
  sport: string
  match: {
    home: string
    away: string
    home_logo: string
    away_logo: string
    home_score: number | null
    away_score: number | null
    home_ht_score: number | null
    away_ht_score: number | null
    status: string
    status_text: string
    time: string
    competition: string
    live_minute: number | string | null
    incidents: MatchIncident[]
    stats: MatchStat[]
    lineups: MatchLineups | null
  }
  updated: string
}

// A slug only names the pairing, not the game: confirmed 2026-10-04 that
// "cherno-more-varna-vs-levski-sofia" (next league match, 2026-10-11)
// answers with the finished 2026-03-21 meeting, and round 6's slug answers
// with a September friendly. The widget accepts no match id, so we check the
// returned kickoff against the one we expect; on a mismatch, fall back to the
// day's fixture list, which is always the right game but carries only
// score/status (no incidents, stats or lineups).
const SAME_MATCH_TOLERANCE_MS = 12 * 60 * 60 * 1000

function sameKickoff(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= SAME_MATCH_TOLERANCE_MS
}

interface DayFixturesResponse {
  matches: SportScoreMatch[]
}

export async function fetchMatchDetail(slug: string, kickoff: string): Promise<MatchDetail> {
  const detail = await fetchJson<MatchDetail>(`/api/widget/match/?sport=football&slug=${slug}`)
  if (sameKickoff(detail.match.time, kickoff)) return detail

  const date = new Date(kickoff).toISOString().slice(0, 10) // the endpoint's date is UTC
  const day = await fetchJson<DayFixturesResponse>(`/api/v1/fixtures/?sport=football&date=${date}&team=${TEAM_SLUG}`)
  const m = day.matches.find((x) => sameKickoff(x.time, kickoff))
  if (!m) throw new Error(`Match ${slug} on ${date} not found`)
  return {
    sport: 'football',
    updated: new Date().toISOString(),
    match: {
      home: m.home,
      away: m.away,
      home_logo: m.home_logo,
      away_logo: m.away_logo,
      home_score: toNumber(m.home_score),
      away_score: toNumber(m.away_score),
      home_ht_score: null,
      away_ht_score: null,
      status: m.status,
      status_text: m.status_text,
      time: m.time,
      competition: m.competition,
      live_minute: null,
      incidents: [],
      stats: [],
      lineups: null,
    },
  }
}
