// Match archive provider — reads public/data/history/*.json at runtime,
// same static-file pattern as providers/manual.ts. Built by
// `npm run build:history` from the user's own local scraper output; see
// scripts/build-history.mjs and docs/plans/2026-08-history-data-shaping.md.

import type { HistoryIndex, SeasonHistory } from '../../types/history'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (${path})`)
  return res.json() as Promise<T>
}

export function fetchHistoryIndex(): Promise<HistoryIndex> {
  return fetchJson<HistoryIndex>('/data/history/index.json')
}

export function fetchSeasonHistory(season: string): Promise<SeasonHistory> {
  return fetchJson<SeasonHistory>(`/data/history/${season}.json`)
}
