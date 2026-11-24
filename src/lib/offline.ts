// Offline helpers: what counts as "stored on the phone", how to read the saved
// login, whether the network is up. Pure where possible.

import { useSyncExternalStore } from 'react'
import { onlineManager } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'

// ---------- online state ----------

/** TanStack assumes "online" until it hears an event; ask the browser at start-up. */
export function initOnlineState(): void {
  onlineManager.setOnline(navigator.onLine)
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  )
}

/** A failed network request (not a rejection from the server): worth retrying later. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true // fetch itself throws a TypeError when offline
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : ''
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
}

// ---------- the saved login ----------

/** supabase-js keeps the session in localStorage as sb-<project ref>-auth-token. */
export const authStorageKey = (supabaseUrl: string): string =>
  `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

/** The user inside a stored session, or null when there is no usable session. */
export function storedSessionUser(raw: string | null): User | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as { refresh_token?: unknown; user?: { id?: unknown } } | null
    if (s && typeof s.refresh_token === 'string' && s.user && typeof s.user.id === 'string') return s.user as User
  } catch {
    /* corrupt value: treat as no session */
  }
  return null
}

/**
 * With an expired access token and no network, supabase-js reports "no session"
 * even though the saved login is still good (it refreshes once the network is back).
 * This reads that saved login so the app does not send an offline user to the login page.
 */
export function readStoredUser(): User | null {
  try {
    return storedSessionUser(localStorage.getItem(authStorageKey(import.meta.env.VITE_SUPABASE_URL as string)))
  } catch {
    return null
  }
}

// ---------- what is kept on the phone ----------

/**
 * Should this query go into the copy saved on the phone? Anything we keep for
 * offline use that has data. A refresh that failed (for instance the moment the
 * network drops) leaves the query in an error state but keeps its last good data,
 * so it must stay in the saved copy: dropping it there is what made lists vanish.
 */
export function shouldStoreQuery(query: { queryKey: readonly unknown[]; state: { data: unknown } }): boolean {
  return query.state.data !== undefined && isStoredQuery(query.queryKey)
}

const STORED_ROOTS = new Set(['shopping', 'foods', 'measures', 'aisle-map', 'aisle-overrides', 'is-admin'])

/**
 * Only shopping data and the small reference tables are saved for offline use.
 * Recipes and image links are not, and neither is the "recipe already on list"
 * check (it is only used while adding online).
 */
export function isStoredQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  if (typeof root !== 'string' || !STORED_ROOTS.has(root)) return false
  return !(root === 'shopping' && queryKey[1] === 'recipe-rows')
}
