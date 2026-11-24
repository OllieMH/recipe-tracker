import { describe, expect, it } from 'vitest'
import { authStorageKey, isNetworkError, isStoredQuery, shouldStoreQuery, storedSessionUser } from './offline'

describe('offline helpers', () => {
  it('finds the saved login, and only a usable one', () => {
    const good = JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u1', email: 'x@y.z' } })
    expect(storedSessionUser(good)?.id).toBe('u1')
    for (const bad of [null, '', 'not json', '{}', JSON.stringify({ refresh_token: 'r' }), JSON.stringify({ user: { id: 'u1' } })]) {
      expect(storedSessionUser(bad)).toBeNull()
    }
    expect(authStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token')
  })

  it('saves shopping data and reference tables for offline use, but not recipes or add-time checks', () => {
    for (const key of [['shopping', 'items', 'l1'], ['shopping', 'lists'], ['foods'], ['measures', [1, 2]], ['aisle-map'], ['aisle-overrides']]) {
      expect(isStoredQuery(key)).toBe(true)
    }
    for (const key of [['recipes', 'list'], ['image-urls', ['a']], ['favorites', 'u1'], ['shopping', 'recipe-rows', 'l1', 'r1'], []]) {
      expect(isStoredQuery(key)).toBe(false)
    }
  })

  it('keeps the last good data of a query whose refresh failed, and skips queries with no data', () => {
    const q = (queryKey: unknown[], data: unknown) => ({ queryKey, state: { data } })
    expect(shouldStoreQuery(q(['shopping', 'lists'], []))).toBe(true) // an empty list is still data
    expect(shouldStoreQuery(q(['shopping', 'items', 'l1'], [{ id: 1 }]))).toBe(true)
    expect(shouldStoreQuery(q(['shopping', 'lists'], undefined))).toBe(false) // never loaded
    expect(shouldStoreQuery(q(['recipes', 'list'], [{ id: 'r' }]))).toBe(false) // not kept offline
  })

  it('tells a failed request (retry later) from a server refusal (give up)', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true)
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
