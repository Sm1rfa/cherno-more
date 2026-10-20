export interface SeasonSummary {
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  cleanSheets?: number
  coaches?: Record<string, number>
}

export interface LeaderboardEntry {
  name: string
  number: number | null
  goals?: number
  assists?: number
  yellowCards?: number
  redCards?: number
}

export type HistoryEvent =
  | { type: 'goal'; minute: string; scorer: string | null; assist: string | null; isPenalty: boolean; isOwnGoal: boolean; forUs: boolean }
  | { type: 'card'; card: 'yellow' | 'red'; minute: string; player: string | null; forUs: boolean }
  | { type: 'substitution'; minute: string; in: string | null; out: string | null; forUs: boolean }

export interface HistoryMatch {
  round: string
  date: string | null
  opponent: string
  isHome: boolean
  score: string
  venue: string | null
  city: string | null
  referee: string | null
  attendance: number | null
  weather: string | null
  events: HistoryEvent[]
}

export interface SeasonHistory {
  season: string
  summary: SeasonSummary
  topScorers: LeaderboardEntry[]
  topAssisters: LeaderboardEntry[]
  mostCarded: LeaderboardEntry[]
  matches: HistoryMatch[]
}

export interface SeasonIndexEntry {
  season: string
  played: number
  wins: number
  draws: number
  losses: number
}

export interface HistoryIndex {
  seasons: SeasonIndexEntry[]
  allTime: SeasonSummary
}
