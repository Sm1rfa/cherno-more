// Cache-aside helper backed by localStorage.
// Survives full page reloads and Vite HMR, which is what lets dev sessions
// avoid re-hitting rate-limited APIs on every reload.

const PREFIX = 'cache:v1:'

interface Entry<T> {
  data: T
  fetchedAt: number
}

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as Entry<T>
  } catch {
    return null
  }
}

function write<T>(key: string, data: T): void {
  try {
    const entry: Entry<T> = { data, fetchedAt: Date.now() }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable (private mode) — caching is best-effort
  }
}

export interface GetOrFetchOptions {
  /** Bypass a fresh cache hit and force a real fetch (still falls back to cache on error). */
  force?: boolean
}

export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options: GetOrFetchOptions = {},
): Promise<T> {
  const cached = read<T>(key)

  if (!options.force && cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.data
  }

  try {
    const fresh = await fetcher()
    write(key, fresh)
    return fresh
  } catch (err) {
    if (cached) return cached.data
    throw err
  }
}

/** Drop one cache entry so the next getOrFetch call misses and refetches, bypassing its TTL. */
export function invalidate(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // localStorage unavailable — nothing to invalidate
  }
}

export function clearCache(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

export const CACHE_TTL = {
  fixtures: 10 * 60 * 1000,
  standings: 60 * 60 * 1000,
  // Short: squad.json can now be updated independently of an app deploy, so
  // a long TTL would defeat the point of that (see public/data/README.md).
  squad: 15 * 60 * 1000,
  // Long: history only changes when someone reruns `npm run build:history`.
  history: 24 * 60 * 60 * 1000,
} as const
