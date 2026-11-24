import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, dehydrate, hydrate, onlineManager } from '@tanstack/react-query'

// A fake database: records what was sent, and can fail like a lost connection.
const sent: { fields: unknown; ids: unknown }[] = []
const inserted: Record<string, unknown>[] = []
let connectionError: Error | null = null
let alreadyThere = false // the server answers "duplicate key": an earlier attempt got through
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      update: (fields: unknown) => ({
        in: async (_column: string, ids: unknown) => {
          if (connectionError) throw connectionError
          sent.push({ fields, ids })
          return { error: null }
        },
      }),
      insert: async (row: Record<string, unknown>) => {
        if (connectionError) throw connectionError
        if (alreadyThere) return { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        inserted.push(row)
        return { error: null }
      },
    }),
  },
}))

import type { ShoppingItem } from './shopping'
import {
  MUTATION,
  itemsKey,
  patchEditRows,
  registerShoppingMutationDefaults,
  scopeOf,
  type AddItemVars,
} from './shopping-mutations'

const item = (id: string, checked = false): ShoppingItem =>
  ({
    id, seq: Number(id.replace(/\D/g, '') || 0), name: `vare ${id}`, amount: null, amount_max: null, unit: null,
    food_id: null, aisle: 'Annet', checked, recipe_id: null, recipe_title: null, position: 0,
    orig_amount: null, orig_amount_max: null, orig_unit: null, list_id: 'l1', created_at: '',
  }) as ShoppingItem

afterEach(() => {
  vi.useRealTimers()
  onlineManager.setOnline(true)
  connectionError = null
  alreadyThere = false
  sent.length = 0
  inserted.length = 0
})

describe('shopping edits without a network', () => {
  it('an edit made offline shows at once, survives a restart, and is sent when the network is back', async () => {
    vi.useFakeTimers()
    onlineManager.setOnline(false)
    connectionError = new TypeError('Failed to fetch')

    // Before the restart: offline, tick an item.
    const before = new QueryClient()
    registerShoppingMutationDefaults(before)
    before.setQueryData(itemsKey('l1'), [item('a1'), item('a2')])
    const mutation = before.getMutationCache().build(before, { mutationKey: MUTATION.setChecked, scope: scopeOf('l1') })
    void mutation.execute({ listId: 'l1', ids: ['a1'], checked: true }).catch(() => {})
    await vi.advanceTimersByTimeAsync(2000)

    expect(before.getQueryData<ShoppingItem[]>(itemsKey('l1'))?.map((i) => i.checked)).toEqual([true, false]) // visible at once
    expect(sent).toHaveLength(0) // nothing reached the database

    // What gets saved on the phone, exactly as it goes through IndexedDB.
    const saved = JSON.parse(JSON.stringify(dehydrate(before)))
    expect(saved.mutations).toHaveLength(1)
    expect(saved.mutations[0].state.variables).toEqual({ listId: 'l1', ids: ['a1'], checked: true })

    // After the restart: a fresh client restores it, the network returns, the edit is sent.
    connectionError = null
    const after = new QueryClient()
    registerShoppingMutationDefaults(after)
    hydrate(after, saved)
    onlineManager.setOnline(true)
    await after.resumePausedMutations()

    expect(sent).toEqual([{ fields: { checked: true }, ids: ['a1'] }])
  })

  it('edits made while offline reach the database once, in the order they were made', async () => {
    vi.useFakeTimers()
    onlineManager.setOnline(false)
    connectionError = new TypeError('Failed to fetch')

    const qc = new QueryClient()
    registerShoppingMutationDefaults(qc)
    qc.mount() // what the app's QueryClientProvider does: it resumes waiting edits when the network returns
    qc.setQueryData(itemsKey('l1'), [item('a1')])
    const run = (checked: boolean) => {
      const m = qc.getMutationCache().build(qc, { mutationKey: MUTATION.setChecked, scope: scopeOf('l1') })
      void m.execute({ listId: 'l1', ids: ['a1'], checked }).catch(() => {})
    }
    run(true)
    run(false)
    run(true)
    await vi.advanceTimersByTimeAsync(2000)

    connectionError = null
    onlineManager.setOnline(true)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(sent.map((s) => (s.fields as { checked: boolean }).checked)).toEqual([true, false, true])
    qc.unmount()
  })

  it('an item typed offline appears at once, survives a restart, and is inserted once with the id made on the phone', async () => {
    vi.useFakeTimers()
    onlineManager.setOnline(false)
    connectionError = new TypeError('Failed to fetch')
    const vars: AddItemVars = {
      listId: 'l1',
      item: { id: '7b0e2f3c-0000-4000-8000-000000000001', name: 'melk', amount: 2, unit: 'dl', food_id: null, aisle: 'Meieri og egg' },
    }

    const before = new QueryClient()
    registerShoppingMutationDefaults(before)
    before.setQueryData(itemsKey('l1'), [item('a1')])
    const mutation = before.getMutationCache().build(before, { mutationKey: MUTATION.addItem, scope: scopeOf('l1') })
    void mutation.execute(vars).catch(() => {})
    await vi.advanceTimersByTimeAsync(2000)

    // on the list straight away, under the id the phone made, and last in the order
    const list = before.getQueryData<ShoppingItem[]>(itemsKey('l1'))!
    expect(list.map((i) => i.id)).toEqual(['a1', vars.item.id])
    expect(list[1]).toMatchObject({ name: 'melk', amount: 2, unit: 'dl', checked: false, aisle: 'Meieri og egg' })
    expect(inserted).toHaveLength(0)

    const saved = JSON.parse(JSON.stringify(dehydrate(before)))
    expect(saved.mutations).toHaveLength(1)

    connectionError = null
    const after = new QueryClient()
    registerShoppingMutationDefaults(after)
    hydrate(after, saved)
    onlineManager.setOnline(true)
    await after.resumePausedMutations()

    expect(inserted).toEqual([{ list_id: 'l1', ...vars.item }])
  })

  it('"duplicate key" from the server means an earlier try got through, so it counts as sent', async () => {
    alreadyThere = true
    const qc = new QueryClient()
    registerShoppingMutationDefaults(qc)
    qc.setQueryData(itemsKey('l1'), [])
    const m = qc.getMutationCache().build(qc, { mutationKey: MUTATION.addItem, scope: scopeOf('l1') })
    await expect(
      m.execute({ listId: 'l1', item: { id: 'x', name: 'melk', amount: null, unit: null, food_id: null, aisle: 'Annet' } }),
    ).resolves.not.toThrow()
    expect(m.state.status).toBe('success')
  })
})

describe('how an edit changes the cached list', () => {
  it('deletes rows and rewrites others in one step', () => {
    const items = [item('a1'), item('a2'), item('a3')]
    const next = patchEditRows(items, {
      listId: 'l1',
      updates: [{ id: 'a2', amount: 5, amount_max: null, unit: 'dl', orig_amount: null, orig_amount_max: null, orig_unit: null }],
      deleteIds: ['a3'],
    })
    expect(next.map((i) => i.id)).toEqual(['a1', 'a2'])
    expect(next[1]).toMatchObject({ amount: 5, unit: 'dl' })
  })
})
