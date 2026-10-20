// Shared fixture-status classification. Every provider maps its own native
// status vocabulary onto this one set of short codes before returning a
// Fixture, so this is the only place that needs to know all of them.

export type FixtureState = 'upcoming' | 'live' | 'finished' | 'cancelled'

export function fixtureState(status: string): FixtureState {
  switch (status) {
    case 'FINISHED':
    case 'NOT_COUNTED':
      return 'finished'
    case 'LIVE':
      return 'live'
    case 'CANCELLED':
    case 'ANNULLED':
    case 'ABANDONED':
      return 'cancelled'
    default: // SCHEDULED, NOT_SCHEDULED, POSTPONED, BROUGHT_FORWARD, TEAM_BYE
      return 'upcoming'
  }
}
