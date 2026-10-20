// Polls SportScore's match-detail endpoint for live score/incidents — but
// ONLY while `fixture` is inside its live window, and only while the tab is
// visible. Outside that window this is a no-op timer, not a real request:
// no polling runs for the days between matches.
//
// This is deliberately client-side (each visiting browser polls with its
// own IP against SportScore's ~10,000 req/day/IP free-tier quota — see
// docs/api-reference.md), not a shared server hammering one IP. At 30s
// cadence, even the full 3h window below is ~360 requests, far under quota.

import { useEffect, useState } from 'react'
import { fetchMatchDetail, type MatchDetail } from '../api/providers/sportscore'
import { invalidate } from '../api/cache'
import type { Fixture } from '../types/football'

const POLL_MS = 30_000
const PRE_KICKOFF_WINDOW_MS = 10 * 60 * 1000
// Safety cap in case SportScore never reports 'finished' for some reason —
// stop polling this long after kickoff regardless.
const MAX_WINDOW_MS = 3 * 60 * 60 * 1000

function isWithinLiveWindow(kickoffMs: number, now: number): boolean {
  return now >= kickoffMs - PRE_KICKOFF_WINDOW_MS && now <= kickoffMs + MAX_WINDOW_MS
}

export function useLiveMatch(fixture: Fixture | null): { detail: MatchDetail | null; error: string | null } {
  const slug = fixture?.fixture.slug
  const kickoff = fixture?.fixture.date
  const kickoffMs = kickoff ? new Date(kickoff).getTime() : null

  const [detail, setDetail] = useState<MatchDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    if (!slug || kickoffMs == null) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      if (cancelled) return

      if (!document.hidden && isWithinLiveWindow(kickoffMs!, Date.now())) {
        try {
          const d = await fetchMatchDetail(slug!, kickoff!)
          if (cancelled) return
          setDetail(d)
          setError(null)
          if (d.match.status === 'finished') {
            // Standings/fixtures caches (60 min / 10 min TTL) would otherwise
            // show a stale table until they naturally expire — drop them so
            // the next visit to those tabs fetches the real post-match state.
            invalidate('standings')
            invalidate('fixtures')
            return // done — stop polling this match
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message)
        }
      }

      if (Date.now() > kickoffMs! + MAX_WINDOW_MS) return // window over, stop entirely
      timer = setTimeout(poll, POLL_MS)
    }

    poll()

    function onVisibilityChange() {
      if (!document.hidden) {
        if (timer) clearTimeout(timer)
        poll()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [slug, kickoff, kickoffMs])

  return { detail, error }
}
