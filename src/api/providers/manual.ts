// Manual data provider — fixtures/standings/squad served as plain JSON files
// from public/data/ (fetched at runtime like any static asset), not bundled
// into the app's JS. That means updating a value is: edit the JSON, redeploy
// just that file — no app rebuild required. See public/data/README.md for
// the file formats, and docs/api-reference.md for the full rationale
// (this data was pasted/read by a human, not scraped — see
// docs/plans/2026-08-data-sources-declined.md).
//
// Used as the fixtures/standings source until a working VITE_GOALBG_KEY
// exists (see ../football.ts), and after that, as the fallback if goal.bg
// ever fails. Squad has no live counterpart and is always manual.

import { OUR_TEAM_ID } from '../constants'
import type { Fixture, Standing } from '../../types/football'
import type { SquadCoach, SquadPlayer } from '../../types/squad'

export const OUR_TEAM_NAME = 'Черно море'

// Assigns a stable numeric id per team name within a single page load — all
// that's needed is for the same name to always map to the same id, and for
// "us" to always be OUR_TEAM_ID, so components can compare team.id === TEAM_ID
// the same way regardless of which provider (goal.bg or this one) answered.
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
  const res = await fetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (${path})`)
  return res.json() as Promise<T>
}

export interface DatasetMeta {
  updatedAt: string
}

// ---- Fixtures ----

interface FixturesFile extends DatasetMeta {
  matches: Array<{
    round: number
    date: string
    time: string | null
    home: string
    away: string
    homeGoals: number | null
    awayGoals: number | null
  }>
}

function mapMatch(m: FixturesFile['matches'][number]): Fixture {
  const played = m.homeGoals != null && m.awayGoals != null
  const draw = played && m.homeGoals === m.awayGoals
  return {
    fixture: {
      id: m.round,
      date: `${m.date}T${m.time ?? '00:00'}:00`,
      timeTBD: m.time == null,
      status: { short: played ? 'FINISHED' : 'SCHEDULED', elapsed: null },
    },
    league: { name: 'Първа лига', round: String(m.round) },
    teams: {
      home: { id: idFor(m.home), name: m.home, logo: '', winner: played ? (draw ? null : m.homeGoals! > m.awayGoals!) : null },
      away: { id: idFor(m.away), name: m.away, logo: '', winner: played ? (draw ? null : m.awayGoals! > m.homeGoals!) : null },
    },
    goals: { home: m.homeGoals, away: m.awayGoals },
  }
}

export async function fetchFixtures(): Promise<Fixture[]> {
  const data = await fetchJson<FixturesFile>('/data/fixtures.json')
  return data.matches.map(mapMatch)
}

/**
 * League round number per match date ("2026-11-02" -> 14). Used by the
 * SportScore provider, which has no round numbers of its own. Cherno More
 * plays at most one league match per day, so the date is a safe key.
 */
export async function fetchLeagueRoundsByDate(): Promise<Map<string, number>> {
  const data = await fetchJson<FixturesFile>('/data/fixtures.json')
  return new Map(data.matches.map((m) => [m.date, m.round]))
}

export async function fetchFixturesMeta(): Promise<DatasetMeta> {
  const data = await fetchJson<FixturesFile>('/data/fixtures.json')
  return { updatedAt: data.updatedAt }
}

// ---- Standings ----

interface StandingsFile extends DatasetMeta {
  rows: Array<{
    rank: number
    team: string
    played: number
    win: number
    draw: number
    lose: number
    goalsFor: number
    goalsAgainst: number
    points: number
  }>
}

// After the first phase, the league splits into three groups by final rank —
// used here as the standings' zone/description.
function phaseGroup(rank: number): string {
  if (rank <= 4) return 'Първа група (1-4 място)'
  if (rank <= 8) return 'Втора група (5-8 място)'
  return 'Трета група (9-14 място)'
}

function mapRow(r: StandingsFile['rows'][number]): Standing {
  return {
    rank: r.rank,
    team: { id: idFor(r.team), name: r.team, logo: '' },
    points: r.points,
    goalsDiff: r.goalsFor - r.goalsAgainst,
    all: {
      played: r.played,
      win: r.win,
      draw: r.draw,
      lose: r.lose,
      goals: { for: r.goalsFor, against: r.goalsAgainst },
    },
    form: null,
    description: phaseGroup(r.rank),
  }
}

export async function fetchStandings(): Promise<Standing[]> {
  const data = await fetchJson<StandingsFile>('/data/standings.json')
  return data.rows.map(mapRow)
}

export async function fetchStandingsMeta(): Promise<DatasetMeta> {
  const data = await fetchJson<StandingsFile>('/data/standings.json')
  return { updatedAt: data.updatedAt }
}

// ---- Squad ----

interface SquadFile {
  updatedAt: string
  players: SquadPlayer[]
  coaches: SquadCoach[]
}

export async function fetchSquad(): Promise<{ players: SquadPlayer[]; coaches: SquadCoach[]; updatedAt: string }> {
  const data = await fetchJson<SquadFile>('/data/squad.json')
  return { players: data.players, coaches: data.coaches, updatedAt: data.updatedAt }
}
