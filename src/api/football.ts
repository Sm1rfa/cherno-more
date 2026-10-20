// Football data orchestrator.
//
// Fixtures/standings priority: SportScore (free, key-free, verified accurate
// — see providers/sportscore.ts) -> goal.bg (if VITE_GOALBG_KEY is set) ->
// the manual JSON dataset (public/data/*.json, see providers/manual.ts and
// public/data/README.md) as the last resort if everything else fails.
//
// api-football was removed — its free plan only serves 2022-2024 seasons,
// which makes it useless for a current-season fan app (see docs/plans).
// Squad data has no free API source at all and always comes from
// public/data/squad.json via the manual provider.
//
// Every call goes through cache.getOrFetch so repeated dev reloads and normal
// usage don't hammer any of these for no reason.

import { CACHE_TTL, getOrFetch } from './cache'
import * as goalBg from './providers/goalBg'
import * as history from './providers/history'
import * as manual from './providers/manual'
import * as sportscore from './providers/sportscore'
import type { Fixture, Standing } from '../types/football'
import type { HistoryIndex, SeasonHistory } from '../types/history'
import type { SquadCoach, SquadPlayer } from '../types/squad'

export { fixtureState } from './fixtureState'
export type { FixtureState } from './fixtureState'
export { OUR_TEAM_ID as TEAM_ID } from './constants'
export { fetchFixturesMeta, fetchStandingsMeta } from './providers/manual'
export type { DatasetMeta } from './providers/manual'

async function withFallback<T>(...fetchers: Array<() => Promise<T>>): Promise<T> {
  let lastError: unknown
  for (const fetcher of fetchers) {
    try {
      return await fetcher()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

export function fetchFixtures(options: { force?: boolean } = {}): Promise<Fixture[]> {
  const fetchers = [sportscore.fetchFixtures, ...(goalBg.hasKey() ? [goalBg.fetchFixtures] : []), manual.fetchFixtures]
  return getOrFetch('fixtures', CACHE_TTL.fixtures, () => withFallback(...fetchers), options)
}

export function fetchStandings(options: { force?: boolean } = {}): Promise<Standing[]> {
  const fetchers = [sportscore.fetchStandings, ...(goalBg.hasKey() ? [goalBg.fetchStandings] : []), manual.fetchStandings]
  return getOrFetch('standings', CACHE_TTL.standings, () => withFallback(...fetchers), options)
}

export function fetchSquad(
  options: { force?: boolean } = {},
): Promise<{ players: SquadPlayer[]; coaches: SquadCoach[]; updatedAt: string }> {
  return getOrFetch('squad', CACHE_TTL.squad, manual.fetchSquad, options)
}

export function fetchHistoryIndex(options: { force?: boolean } = {}): Promise<HistoryIndex> {
  return getOrFetch('history:index', CACHE_TTL.history, history.fetchHistoryIndex, options)
}

export function fetchSeasonHistory(season: string, options: { force?: boolean } = {}): Promise<SeasonHistory> {
  return getOrFetch(`history:${season}`, CACHE_TTL.history, () => history.fetchSeasonHistory(season), options)
}
