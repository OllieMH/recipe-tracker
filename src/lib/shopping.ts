// Shopping lists: queries and mutations. Pure display/merge rules live in
// shopping-merge.ts; this file only talks to Supabase and keeps the cache fresh.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Database } from '@/types/database'
import type { Food } from './foods'
import type { MergeItem, RowUpdate } from './shopping-merge'

type Tables = Database['public']['Tables']
export type ShoppingList = Tables['shopping_lists']['Row']
export type ShoppingItem = MergeItem & { list_id: string; created_at: string }

const num = (v: unknown): number | null => (v == null ? null : Number(v))

function toItem(row: Tables['shopping_list_items']['Row']): ShoppingItem {
  return {
    ...row,
    amount: num(row.amount),
    amount_max: num(row.amount_max),
    orig_amount: num(row.orig_amount),
    orig_amount_max: num(row.orig_amount_max),
  }
}

const itemsKey = (listId: string) => ['shopping', 'items', listId] as const

// ---------- lists ----------

export function useShoppingLists() {
  return useQuery({
    queryKey: ['shopping', 'lists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('id, name, owner_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** list id -> how many items and how many are still open. */
export function useListCounts() {
  return useQuery({
    queryKey: ['shopping', 'counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shopping_list_items').select('list_id, checked')
      if (error) throw error
      const map = new Map<string, { total: number; open: number }>()
      for (const r of data) {
        const c = map.get(r.list_id) ?? { total: 0, open: 0 }
        c.total += 1
        if (!r.checked) c.open += 1
        map.set(r.list_id, c)
      }
      return map
    },
  })
}

export function useShoppingList(id: string | undefined) {
  return useQuery({
    queryKey: ['shopping', 'list', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('id, name, owner_id, created_at')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useCreateList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_list', { p_name: name })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

export function useRenameList(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('shopping_lists').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

export function useDeleteList(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shopping_lists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

// ---------- items ----------

export function useShoppingItems(listId: string | undefined) {
  return useQuery({
    queryKey: itemsKey(listId ?? ''),
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('list_id', listId!)
        .order('position')
        .order('id')
      if (error) throw error
      return data.map(toItem)
    },
  })
}

export interface NewItem {
  name: string
  amount: number | null
  unit: string | null
  food_id: number | null
  aisle: string
}

export function useAddItem(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: NewItem) => {
      const { error } = await supabase.from('shopping_list_items').insert({ list_id: listId, ...item })
      if (error) throw error
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: itemsKey(listId) })
      void qc.invalidateQueries({ queryKey: ['shopping', 'counts'] })
    },
  })
}

/**
 * A mutation on the items of one list that updates the cache straight away
 * (poor signal in a shop should not make ticking feel slow) and rolls back on error.
 */
function useOptimisticItems<V>(
  listId: string,
  run: (v: V) => Promise<void>,
  patch: (items: ShoppingItem[], v: V) => ShoppingItem[],
) {
  const qc = useQueryClient()
  const key = itemsKey(listId)
  return useMutation({
    mutationFn: run,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ShoppingItem[]>(key)
      qc.setQueryData<ShoppingItem[]>(key, (old) => (old ? patch(old, v) : old))
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['shopping', 'counts'] })
    },
  })
}

export function useSetChecked(listId: string) {
  return useOptimisticItems<{ ids: number[]; checked: boolean }>(
    listId,
    async ({ ids, checked }) => {
      const { error } = await supabase.from('shopping_list_items').update({ checked }).in('id', ids)
      if (error) throw error
    },
    (items, { ids, checked }) => items.map((i) => (ids.includes(i.id) ? { ...i, checked } : i)),
  )
}

export function useDeleteItems(listId: string) {
  return useOptimisticItems<number[]>(
    listId,
    async (ids) => {
      const { error } = await supabase.from('shopping_list_items').delete().in('id', ids)
      if (error) throw error
    },
    (items, ids) => items.filter((i) => !ids.includes(i.id)),
  )
}

export function useClearChecked(listId: string) {
  return useOptimisticItems<void>(
    listId,
    async () => {
      const { error } = await supabase.from('shopping_list_items').delete().eq('list_id', listId).eq('checked', true)
      if (error) throw error
    },
    (items) => items.filter((i) => !i.checked),
  )
}

export interface RowEdit {
  /** Each update rewrites one row (conversion, merge, undo, new amount or unit). */
  updates: RowUpdate[]
  /** Rows a decrease used up. */
  deleteIds?: number[]
}

/** Amount and unit edits: updates and deletes in one optimistic step. */
export function useEditRows(listId: string) {
  return useOptimisticItems<RowEdit>(
    listId,
    async ({ updates, deleteIds = [] }) => {
      const results = await Promise.all([
        ...updates.map(({ id, ...fields }) => supabase.from('shopping_list_items').update(fields).eq('id', id)),
        ...(deleteIds.length > 0 ? [supabase.from('shopping_list_items').delete().in('id', deleteIds)] : []),
      ])
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    (items, { updates, deleteIds = [] }) =>
      items
        .filter((i) => !deleteIds.includes(i.id))
        .map((i) => {
          const u = updates.find((x) => x.id === i.id)
          return u ? { ...i, ...u } : i
        }),
  )
}

// ---------- aisles ----------

/** foods.category -> store aisle (77 rows, static). */
export function useAisleMap() {
  return useQuery({
    queryKey: ['aisle-map'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('aisle_map').select('category, aisle')
      if (error) throw error
      return new Map(data.map((r) => [r.category, r.aisle]))
    },
  })
}

export function aisleFor(food: Pick<Food, 'category'> | null | undefined, map: Map<string, string> | undefined): string {
  return (food?.category && map?.get(food.category)) || 'Annet'
}
