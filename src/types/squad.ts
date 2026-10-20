export type Position = 'вратар' | 'защитник' | 'полузащитник' | 'нападател'

export interface SquadPlayer {
  id: number
  name: string
  /** Optional secondary line, e.g. the official Latin-script spelling for foreign players. */
  nameLatin?: string
  number: number | null
  position: Position
  /** Birth year only (that's all the club site publishes) — age is computed from this. */
  birthYear?: number
  /** Country name (e.g. "Bulgaria", "Nigeria") — used to look up a flag emoji. */
  nationality?: string
  photo?: string
  captain?: boolean
  goals?: number
  assists?: number
  yellowCards?: number
  redCards?: number
  heightCm?: number
  weightKg?: number
  /** Set when out on loan elsewhere — kept in the roster (not removed) with this note, e.g. "Ал Харития (Катар)". */
  loanedTo?: string
}

export interface SquadCoach {
  id: number
  name: string
  role?: string
}
