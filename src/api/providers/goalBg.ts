// api.goal.bg direct client — sole live-data provider for fixtures + standings.
// (api-football's free plan only serves 2022-2024 seasons, useless for a
// current-season fan app; goal.bg is free-tier-friendly and Bulgaria-specific.)
// Auth: `X-GOALBG-Key` header, requested manually via api@bgclubs.eu.
// Envelope: { GET, parameters, count, response }
// Docs (self-hosted, not indexed): https://api.goal.bg/

import { OUR_TEAM_ID } from '../constants'
import type { Fixture, Standing } from '../../types/football'

const BASE_URL = 'https://api.goal.bg/v2'

// goal.bg team ids look like "10141-111".
const GOALBG_TEAM_ID = import.meta.env.VITE_GOALBG_TEAM_ID ?? ''
const GOALBG_TOURNAMENT_ID = import.meta.env.VITE_GOALBG_TOURNAMENT_ID ?? '1000000'

export function hasKey(): boolean {
  return Boolean(import.meta.env.VITE_GOALBG_KEY)
}

function getHeaders(): HeadersInit {
  const key = import.meta.env.VITE_GOALBG_KEY
  if (!key) throw new Error('No goal.bg key set. Copy .env.example to .env and add VITE_GOALBG_KEY.')
  return { 'X-GOALBG-Key': key }
}

interface Envelope<T> {
  response: T
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  const json = (await res.json()) as Envelope<T>
  return json.response
}

// Maps "our" team's goal.bg id onto the shared OUR_TEAM_ID constant (also
// used by the manual dataset in src/data/fixtures.ts), so components can
// compare team.id === OUR_TEAM_ID regardless of source. Opponents just get
// their raw numeric prefix, which is fine since nothing keys off those ids.
function canonicalTeamId(goalBgId: string): number {
  if (goalBgId === GOALBG_TEAM_ID) return OUR_TEAM_ID
  return parseInt(goalBgId, 10) || 0
}

// ---- Fixtures ----
// goal.bg has no in-play/live data, so its own matches are always FINISHED/
// SCHEDULED-equivalent — see ../fixtureState.ts for the shared classifier.

interface GoalBgTeam {
  id: string
  name: string
  logo: string
}

interface GoalBgMatch {
  id: number
  round: number | null
  date: string
  time: string
  status: string
  homeTeam: GoalBgTeam
  awayTeam: GoalBgTeam
  score: {
    winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    fullTime: { homeTeam: number | null; awayTeam: number | null }
  }
  tournament: { name: string }
}

function mapMatch(m: GoalBgMatch): Fixture {
  const winner = m.score.winner
  return {
    fixture: {
      id: m.id,
      // goal.bg gives no timezone offset; parsed as local browser time.
      date: `${m.date}T${m.time}:00`,
      status: { short: m.status, elapsed: null },
    },
    league: { name: m.tournament.name, round: m.round != null ? String(m.round) : '' },
    teams: {
      home: {
        id: canonicalTeamId(m.homeTeam.id),
        name: m.homeTeam.name,
        logo: m.homeTeam.logo,
        winner: winner ? winner === 'HOME_TEAM' : null,
      },
      away: {
        id: canonicalTeamId(m.awayTeam.id),
        name: m.awayTeam.name,
        logo: m.awayTeam.logo,
        winner: winner ? winner === 'AWAY_TEAM' : null,
      },
    },
    goals: { home: m.score.fullTime.homeTeam, away: m.score.fullTime.awayTeam },
  }
}

export async function fetchFixtures(): Promise<Fixture[]> {
  if (!hasKey() || !GOALBG_TEAM_ID) {
    throw new Error('goal.bg not configured. Set VITE_GOALBG_KEY and VITE_GOALBG_TEAM_ID in .env.')
  }
  const matches = await apiFetch<GoalBgMatch[]>(
    `/matches.json?tournament_id=${GOALBG_TOURNAMENT_ID}&team_id=${GOALBG_TEAM_ID}`,
  )
  return matches.map(mapMatch)
}

// ---- Standings ----

interface GoalBgStandingRow {
  position: number
  team: GoalBgTeam
  playedGames: string
  wins: string
  draws: string
  losses: string
  goalsFor: string
  goalsAgainst: string
  goalDifference: string
  points: string
  description: string | null
}

interface GoalBgStandingsResponse {
  standings: GoalBgStandingRow[]
}

function mapStandingRow(row: GoalBgStandingRow): Standing {
  return {
    rank: row.position,
    team: { id: canonicalTeamId(row.team.id), name: row.team.name, logo: row.team.logo },
    points: Number(row.points),
    goalsDiff: Number(row.goalDifference),
    all: {
      played: Number(row.playedGames),
      win: Number(row.wins),
      draw: Number(row.draws),
      lose: Number(row.losses),
      goals: { for: Number(row.goalsFor), against: Number(row.goalsAgainst) },
    },
    form: null,
    description: row.description,
  }
}

export async function fetchStandings(): Promise<Standing[]> {
  if (!hasKey()) {
    throw new Error('goal.bg not configured. Set VITE_GOALBG_KEY in .env.')
  }
  const [entry] = await apiFetch<GoalBgStandingsResponse[]>(`/standings.json?tournament_id=${GOALBG_TOURNAMENT_ID}`)
  return (entry?.standings ?? []).map(mapStandingRow)
}
