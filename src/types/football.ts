export interface Fixture {
  fixture: {
    id: number
    date: string
    /** True when only the date is known yet, not the kickoff time (common for far-out rounds). */
    timeTBD?: boolean
    status: { short: string; elapsed: number | null }
    /** SportScore-only: slug for /api/widget/match/, used to poll live detail. Absent for other providers. */
    slug?: string
  }
  league: { name: string; round: string }
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null }
    away: { id: number; name: string; logo: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
}

export interface Standing {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
  form: string | null
  description: string | null
  /** Explicit zone color from the provider (e.g. SportScore's promo_color), when available. */
  color?: string | null
}
