// Shopping list edits that keep working without a network.
//
// An edit shows up in the list at once (optimistic) and is sent to the database
// when it can be. If the phone is offline, or the request fails for network
// reasons, it waits and is retried; waiting edits are saved with the cached data
// on the phone and sent after a restart too. For that to work every input of an
// edit travels in its variables (including the list id) and the function that
// applies it is registered once at start-up with registerShoppingMutationDefaults,
// instead of being a closure inside a component.
//
// All edits here are safe to send twice. Most are absolute ("this item is ticked",
// "the amount is 3", "delete these rows"). Adding an item is made safe by giving it an
// id on the phone: a second insert with the same id is rejected by the primary key,
// and that rejection is treated as "already there".

import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { isNetworkError } from './offline'
import type { ShoppingItem } from './shopping'
import type { RowUpdate } from './shopping-merge'

export const itemsKey = (listId: string) => ['shopping', 'items', listId] as const

/** Every queued shopping edit has a mutation key starting with this (used to count them). */
export const QUEUED_PREFIX = ['shopping', 'm'] as const

export const MUTATION = {
  setChecked: [...QUEUED_PREFIX, 'setChecked'],
  setAisle: [...QUEUED_PREFIX, 'setAisle'],
  deleteItems: [...QUEUED_PREFIX, 'deleteItems'],
  clearChecked: [...QUEUED_PREFIX, 'clearChecked'],
  editRows: [...QUEUED_PREFIX, 'editRows'],
  addItem: [...QUEUED_PREFIX, 'addItem'],
} as const

/** Edits to the rows of one list run one after the other, in the order they were made. */
export const scopeOf = (listId: string) => ({ id: `shopping-items-${listId}` })

export interface RowEdit {
  /** Each update rewrites one row (conversion, merge, undo, new amount or unit). */
  updates: RowUpdate[]
  /** Rows a decrease used up. */
  deleteIds?: string[]
}

/** An item typed by hand. `id` is made on the phone, so the item exists before the server has seen it. */
export interface NewItemRow {
  id: string
  name: string
  amount: number | null
  unit: string | null
  food_id: number | null
  aisle: string
}

export type SetCheckedVars = { listId: string; ids: string[]; checked: boolean }
export type SetAisleVars = { listId: string; ids: string[]; aisle: string }
export type DeleteItemsVars = { listId: string; ids: string[] }
export type ClearCheckedVars = { listId: string }
export type EditRowsVars = { listId: string } & RowEdit
export type AddItemVars = { listId: string; item: NewItemRow }

// ---------- how the cached list changes (pure) ----------

export const patchSetChecked = (items: ShoppingItem[], { ids, checked }: SetCheckedVars): ShoppingItem[] =>
  items.map((i) => (ids.includes(i.id) ? { ...i, checked } : i))

export const patchSetAisle = (items: ShoppingItem[], { ids, aisle }: SetAisleVars): ShoppingItem[] =>
  items.map((i) => (ids.includes(i.id) ? { ...i, aisle } : i))

export const patchDeleteItems = (items: ShoppingItem[], { ids }: DeleteItemsVars): ShoppingItem[] =>
  items.filter((i) => !ids.includes(i.id))

export const patchClearChecked = (items: ShoppingItem[]): ShoppingItem[] => items.filter((i) => !i.checked)

/**
 * The new item shows up at once. `seq` is a stand-in that sorts it last (the real one is
 * counted by the database); the refresh after sending replaces it.
 */
export const patchAddItem = (items: ShoppingItem[], { listId, item }: AddItemVars): ShoppingItem[] =>
  items.some((i) => i.id === item.id)
    ? items
    : [
        ...items,
        {
          id: item.id,
          seq: Date.now(),
          list_id: listId,
          created_at: new Date().toISOString(),
          name: item.name,
          amount: item.amount,
          amount_max: null,
          unit: item.unit,
          food_id: item.food_id,
          aisle: item.aisle,
          checked: false,
          checked_by: null,
          recipe_id: null,
          recipe_title: null,
          position: 0,
          orig_amount: null,
          orig_amount_max: null,
          orig_unit: null,
        },
      ]

export const patchEditRows = (items: ShoppingItem[], { updates, deleteIds = [] }: EditRowsVars): ShoppingItem[] =>
  items
    .filter((i) => !deleteIds.includes(i.id))
    .map((i) => {
      const u = updates.find((x) => x.id === i.id)
      return u ? { ...i, ...u } : i
    })

// ---------- sending them to the database ----------

function must<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error
  return result
}

const runSetChecked = async ({ ids, checked }: SetCheckedVars) => {
  must(await supabase.from('shopping_list_items').update({ checked }).in('id', ids))
}
const runSetAisle = async ({ ids, aisle }: SetAisleVars) => {
  must(await supabase.from('shopping_list_items').update({ aisle }).in('id', ids))
}
const runDeleteItems = async ({ ids }: DeleteItemsVars) => {
  must(await supabase.from('shopping_list_items').delete().in('id', ids))
}
const runClearChecked = async ({ listId }: ClearCheckedVars) => {
  must(await supabase.from('shopping_list_items').delete().eq('list_id', listId).eq('checked', true))
}
const runAddItem = async ({ listId, item }: AddItemVars) => {
  const { error } = await supabase.from('shopping_list_items').insert({ list_id: listId, ...item })
  // 23505 = the id is already there: an earlier attempt got through and only the answer was lost.
  if (error && (error as { code?: string }).code !== '23505') throw error
}
const runEditRows = async ({ updates, deleteIds = [] }: EditRowsVars) => {
  const results = await Promise.all([
    ...updates.map(({ id, ...fields }) => supabase.from('shopping_list_items').update(fields).eq('id', id)),
    ...(deleteIds.length > 0 ? [supabase.from('shopping_list_items').delete().in('id', deleteIds)] : []),
  ])
  for (const r of results) must(r)
}

/** Call once at start-up, before the saved cache is restored (restored edits need these). */
export function registerShoppingMutationDefaults(qc: QueryClient): void {
  function define<V extends { listId: string }>(
    key: readonly string[],
    run: (v: V) => Promise<void>,
    patch: (items: ShoppingItem[], v: V) => ShoppingItem[],
  ) {
    qc.setMutationDefaults(key, {
      mutationFn: run,
      // Try even if the browser claims to be offline (it is often wrong on a weak signal);
      // a failed request is retried, and the retry waits for the network to come back.
      networkMode: 'offlineFirst',
      retry: (_failureCount: number, error: unknown) => isNetworkError(error),
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
      onMutate: async (v: V) => {
        const key = itemsKey(v.listId)
        await qc.cancelQueries({ queryKey: key })
        const prev = qc.getQueryData<ShoppingItem[]>(key)
        qc.setQueryData<ShoppingItem[]>(key, (old) => (old ? patch(old, v) : old))
        return { prev }
      },
      // A refusal from the server (not a network problem): undo the optimistic change.
      // A restored edit has no snapshot; the refresh below corrects the list instead.
      onError: (_error: unknown, v: V, ctx: { prev?: ShoppingItem[] } | undefined) => {
        if (ctx?.prev) qc.setQueryData(itemsKey(v.listId), ctx.prev)
      },
      onSettled: (_data: unknown, _error: unknown, v: V) => {
        // Refresh from the server only after the last waiting edit, so a refresh
        // does not wipe the visible effect of edits that have not been sent yet.
        if (qc.isMutating({ mutationKey: QUEUED_PREFIX }) <= 1) {
          void qc.invalidateQueries({ queryKey: itemsKey(v.listId) })
          void qc.invalidateQueries({ queryKey: ['shopping', 'counts'] })
        }
      },
    })
  }

  define<SetCheckedVars>(MUTATION.setChecked, runSetChecked, patchSetChecked)
  define<SetAisleVars>(MUTATION.setAisle, runSetAisle, patchSetAisle)
  define<DeleteItemsVars>(MUTATION.deleteItems, runDeleteItems, patchDeleteItems)
  define<ClearCheckedVars>(MUTATION.clearChecked, runClearChecked, patchClearChecked)
  define<EditRowsVars>(MUTATION.editRows, runEditRows, patchEditRows)
  define<AddItemVars>(MUTATION.addItem, runAddItem, patchAddItem)
}
