// Saves the query cache in IndexedDB on the phone, one copy per signed-in user.

import { del, get, set } from 'idb-keyval'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { Persister } from '@tanstack/react-query-persist-client'

/** How long a saved copy stays usable. Queries must be kept in memory at least this long. */
export const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7
/** Bump when the shape of saved data changes, so old copies are thrown away. */
export const CACHE_BUSTER = 'v2' // v2: item ids became UUIDs (item_client_ids migration)

export const cacheKey = (userId: string) => `kokebok-cache-${userId}`

const storage = {
  getItem: (key: string) => get<string>(key).then((v) => v ?? null),
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
}

export function createUserPersister(userId: string): Persister {
  // Short throttle: an app that is switched away from can be discarded within seconds.
  return createAsyncStoragePersister({ storage, key: cacheKey(userId), throttleTime: 250 })
}

/** Used while nobody is signed in: saves and restores nothing. */
export const noPersister: Persister = {
  persistClient: async () => {},
  restoreClient: async () => undefined,
  removeClient: async () => {},
}

export const clearUserCache = (userId: string) => del(cacheKey(userId))
