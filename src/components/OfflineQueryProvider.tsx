import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Query, QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useAuth } from '@/lib/auth'
import { CACHE_BUSTER, CACHE_MAX_AGE, clearUserCache, createUserPersister, noPersister } from '@/lib/cache-persister'
import { isStoredQuery } from '@/lib/offline'

/**
 * The query client, with the shopping data saved on the phone (IndexedDB) so lists
 * open without a network, and edits that were made offline kept until they can be sent.
 * One saved copy per signed-in user; it is wiped on sign-out so nothing is left behind.
 * Must sit below AuthProvider.
 */
export default function OfflineQueryProvider({ client, children }: { client: QueryClient; children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const persistOptions = useMemo(
    () => ({
      persister: userId ? createUserPersister(userId) : noPersister,
      maxAge: CACHE_MAX_AGE,
      buster: CACHE_BUSTER,
      dehydrateOptions: {
        shouldDehydrateQuery: (query: Query) => query.state.status === 'success' && isStoredQuery(query.queryKey),
      },
    }),
    [userId],
  )

  // Signed out (or switched user): forget everything in memory and the saved copy.
  const previousUser = useRef(userId)
  useEffect(() => {
    const previous = previousUser.current
    previousUser.current = userId
    if (previous && previous !== userId) {
      client.clear()
      void clearUserCache(previous)
    }
  }, [userId, client])

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={persistOptions}
      // Edits that were waiting when the app was closed are sent now (needs the network).
      onSuccess={() => void client.resumePausedMutations()}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
