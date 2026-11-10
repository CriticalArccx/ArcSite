/**
 * Shares one network request between callers that want the same data at about the same time
 * (ARC-321).
 *
 * Several parts of the app load the same thing independently. On the Dashboard, the Milestones
 * widget and the shell's checklist/issue to-do loader each fetched the same CxAlloy checklists,
 * issues, status vocabulary, people list and NETA data, and every one of those first re-read the
 * project settings and the Apps Script URL. That came to ~19 Apps Script calls and ~30 small
 * Supabase reads per load where ~8 and ~2 are needed, and Apps Script queues calls to a single
 * deployment, so the duplicates made everything slower.
 *
 * `shareRequest(key, ttlMs, fn)` returns the same promise to every caller while the request is in
 * flight, and keeps the result for `ttlMs` after it settles. A failed request is dropped right
 * away so the next caller retries. Writes call `invalidateRequests` so a save is never followed by
 * a stale read.
 */
type Entry = { promise: Promise<unknown>; settledAt: number | null }

const entries = new Map<string, Entry>()

export function shareRequest<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = entries.get(key)
  if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < ttlMs)) return hit.promise as Promise<T>

  const entry: Entry = { promise: fn(), settledAt: null }
  entries.set(key, entry)
  entry.promise.then(
    () => {
      entry.settledAt = Date.now()
    },
    () => {
      if (entries.get(key) === entry) entries.delete(key)
    },
  )
  return entry.promise as Promise<T>
}

/** Drops every shared result whose key starts with `prefix` (all of them with no prefix). */
export function invalidateRequests(prefix = ''): void {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key)
}
