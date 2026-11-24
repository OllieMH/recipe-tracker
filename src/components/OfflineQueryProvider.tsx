import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Query, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider, persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { CACHE_BUSTER, CACHE_MAX_AGE, clearUserCache, createUserPersister, noPersister } from '@/lib/cache-persister'
import { shouldStoreQuery } from '@/lib/offline'

/**
 * The query client, with the shopping data saved on the phone (IndexedDB) so lists
 * open without a network, and edits that were made offline kept until they can be sent.
 * One saved copy per signed-in user. It is wiped only on a real sign-out, or when a
 * different person signs in, so a moment of "no user" while the network drops can
 * never erase anything. Must sit below AuthProvider.
 */
export default function OfflineQueryProvider({ client, children }: { client: QueryClient; children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Whose saved copy is in use. Follows the signed-in user, and is released only by a sign-out.
  const [cacheUser, setCacheUser] = useState<string | null>(userId)
  const cacheUserRef = useRef<string | null>(userId)

  useEffect(() => {
    if (!userId) return // a momentary "no user" changes nothing
    const previous = cacheUserRef.current
    if (previous && previous !== userId) {
      // someone else signed in on this phone: forget the previous person's data
      client.clear()
      void clearUserCache(previous)
    }
    cacheUserRef.current = userId
    setCacheUser(userId)
  }, [userId, client])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      const previous = cacheUserRef.current
      cacheUserRef.current = null
      setCacheUser(null)
      client.clear()
      if (previous) void clearUserCache(previous)
    })
    return () => subscription.unsubscribe()
  }, [client])

  const persistOptions = useMemo(
    () => ({
      persister: cacheUser ? createUserPersister(cacheUser) : noPersister,
      maxAge: CACHE_MAX_AGE,
      buster: CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query: Query) => shouldStoreQuery(query),
      },
    }),
    [cacheUser],
  )

  // Switching away from the app (for instance to flip flight mode) can end with the page
  // being discarded, so save right now instead of waiting for the next throttled save.
  useEffect(() => {
    if (!cacheUser) return
    const save = () => {
      if (document.visibilityState === 'hidden') void persistQueryClientSave({ queryClient: client, ...persistOptions })
    }
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', save)
      window.removeEventListener('pagehide', save)
    }
  }, [cacheUser, client, persistOptions])

  return (
    <PersistQueryClientProvider
      // The provider restores and starts saving ONCE, with the persister it has when it first
      // mounts, and ignores later changes to persistOptions. Auth is still loading at first mount
      // (no user yet, so no persister), so without a key the real persister would never be
      // connected and nothing would be saved. A new key per user mounts it afresh.
      key={cacheUser ?? 'signed-out'}
      client={client}
      persistOptions={persistOptions}
      // Edits that were waiting when the app was closed are sent now (needs the network).
      onSuccess={() => void client.resumePausedMutations()}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
