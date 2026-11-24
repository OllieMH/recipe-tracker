import { describe, expect, it } from 'vitest'
import { authStorageKey, isNetworkError, isStoredQuery, storedSessionUser } from './offline'

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

  it('tells a failed request (retry later) from a server refusal (give up)', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true)
    expect(isNetworkError({ message: 'Load failed' })).toBe(true)
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})
