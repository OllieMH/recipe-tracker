// Shopping lists: queries and mutations. Pure display/merge rules live in
// shopping-merge.ts; this file only talks to Supabase and keeps the cache fresh.

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { overrideKey } from './aisle-overrides'
import type { Database } from '@/types/database'
import type { Food } from './foods'
import type { MergeItem } from './shopping-merge'
import {
  MUTATION,
  itemsKey,
  scopeOf,
  type AddItemVars,
  type ClearCheckedVars,
  type DeleteItemsVars,
  type EditRowsVars,
  type RowEdit,
  type SetAisleVars,
  type SetCheckedVars,
} from './shopping-mutations'

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
// Query data is saved on the phone as JSON, which cannot hold a Map: the queries
// below store plain data and build the Map in `select` (module-level, so stable).
type Counts = Record<string, { total: number; open: number }>
const countsToMap = (counts: Counts): Map<string, { total: number; open: number }> => new Map(Object.entries(counts))

export function useListCounts() {
  return useQuery({
    queryKey: ['shopping', 'counts'],
    queryFn: async (): Promise<Counts> => {
      const { data, error } = await supabase.from('shopping_list_items').select('list_id, checked')
      if (error) throw error
      const counts: Counts = {}
      for (const r of data) {
        const c = (counts[r.list_id] ??= { total: 0, open: 0 })
        c.total += 1
        if (!r.checked) c.open += 1
      }
      return counts
    },
    select: countsToMap,
  })
}

export function useShoppingList(id: string | undefined) {
  const qc = useQueryClient()
  const listsKey = ['shopping', 'lists']
  type ListRow = { id: string; name: string; owner_id: string; created_at: string }
  return useQuery({
    queryKey: ['shopping', 'list', id],
    enabled: !!id,
    // The list's name and owner are already in the saved overview. Start from that, so a
    // list opens offline even when its own entry was not saved; a fetch refines it.
    initialData: () => qc.getQueryData<ListRow[]>(listsKey)?.find((l) => l.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(listsKey)?.dataUpdatedAt,
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

// ---------- members and sharing ----------

export interface ListMember {
  user_id: string
  /** Display name, or the email when there is no display name. */
  label: string
  is_owner: boolean
}

const membersKey = (listId: string) => ['shopping', 'members', listId] as const

export function useListMembers(listId: string | undefined) {
  return useQuery({
    queryKey: membersKey(listId ?? ''),
    enabled: !!listId,
    queryFn: async (): Promise<ListMember[]> => {
      const { data, error } = await supabase.rpc('list_members', { p_list_id: listId! })
      if (error) throw error
      return data
    },
  })
}

/** Owner shares the list with an existing user, by email. Sharing twice is harmless. */
export function useShareList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.rpc('share_list', { p_list_id: listId, p_email: email.trim() })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(listId) }),
  })
}

export function useRemoveMember(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('remove_list_member', { p_list_id: listId, p_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: membersKey(listId) }),
  })
}

/** A member leaves. Access is gone at once; the owner has to share the list again. */
export function useLeaveList(listId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('shopping_list_members')
        .delete()
        .eq('list_id', listId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

/**
 * Live updates: when someone else changes this list the cache is refreshed.
 * Realtime only delivers rows the signed-in user may see (RLS). Bursts of events
 * are coalesced into one refetch so rapid ticking does not flicker.
 */
export function useListRealtime(listId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!listId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = (...keys: (readonly unknown[])[]) => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const queryKey of keys) void qc.invalidateQueries({ queryKey })
      }, 250)
    }

    const channel = supabase
      .channel(`shopping-list-${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items', filter: `list_id=eq.${listId}` },
        () => refresh(itemsKey(listId), ['shopping', 'counts']),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_members', filter: `list_id=eq.${listId}` },
        () => refresh(membersKey(listId), ['shopping', 'list', listId]),
      )
      .subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [listId, qc])
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
        .order('seq') // creation order; ids are random UUIDs
      if (error) throw error
      return data.map(toItem)
    },
  })
}

export interface NewItem {
  name: string
  amount: number | null
  amount_max?: number | null
  unit: string | null
  food_id: number | null
  aisle: string
  /** Set for items that come from a recipe (a snapshot; later recipe edits do not change the list). */
  recipe_id?: string | null
  recipe_title?: string | null
}

/**
 * Add a typed item. It works offline: the item gets an id here on the phone, appears at
 * once, and is sent when the network allows (see shopping-mutations.ts).
 */
export function useAddItem(listId: string) {
  const m = useMutation<void, unknown, AddItemVars>({ mutationKey: MUTATION.addItem, scope: scopeOf(listId) })
  return {
    ...m,
    mutate: (item: Pick<NewItem, 'name' | 'amount' | 'unit' | 'food_id' | 'aisle'>) =>
      m.mutate({ listId, item: { id: crypto.randomUUID(), ...item } }),
  }
}

/** Rows of one recipe already on a list (so the UI can say it will be replaced). */
export function useRecipeRows(listId: string | undefined, recipeId: string) {
  return useQuery({
    queryKey: ['shopping', 'recipe-rows', listId, recipeId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('id')
        .eq('list_id', listId!)
        .eq('recipe_id', recipeId)
      if (error) throw error
      return data.length
    },
  })
}

/**
 * Put a recipe on a list. If the recipe is already there its old rows are
 * replaced: the new rows go in first, then the old ones are removed, so a
 * failure leaves duplicates rather than losing items.
 */
export function useAddRecipeToList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ listId, recipeId, items }: { listId: string; recipeId: string; items: NewItem[] }) => {
      if (items.length === 0) throw new Error('No items to add')
      const old = await supabase.from('shopping_list_items').select('id').eq('list_id', listId).eq('recipe_id', recipeId)
      if (old.error) throw old.error
      const ins = await supabase.from('shopping_list_items').insert(items.map((i) => ({ list_id: listId, ...i })))
      if (ins.error) throw ins.error
      if (old.data.length > 0) {
        const del = await supabase.from('shopping_list_items').delete().in('id', old.data.map((o) => o.id))
        if (del.error) throw del.error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping'] }),
  })
}

// The edits below work offline: see shopping-mutations.ts. The hooks only give each
// call the list id; the function that sends it is registered once at start-up.

export type { RowEdit } from './shopping-mutations'

export function useSetChecked(listId: string) {
  const m = useMutation<void, unknown, SetCheckedVars>({ mutationKey: MUTATION.setChecked, scope: scopeOf(listId) })
  return { ...m, mutate: (v: Omit<SetCheckedVars, 'listId'>) => m.mutate({ listId, ...v }) }
}

/** Move items to another store section (the food database does not know every product). */
export function useSetAisle(listId: string) {
  const m = useMutation<void, unknown, SetAisleVars>({ mutationKey: MUTATION.setAisle, scope: scopeOf(listId) })
  return { ...m, mutate: (v: Omit<SetAisleVars, 'listId'>) => m.mutate({ listId, ...v }) }
}

export function useDeleteItems(listId: string) {
  const m = useMutation<void, unknown, DeleteItemsVars>({ mutationKey: MUTATION.deleteItems, scope: scopeOf(listId) })
  return { ...m, mutate: (ids: string[]) => m.mutate({ listId, ids }) }
}

export function useClearChecked(listId: string) {
  const m = useMutation<void, unknown, ClearCheckedVars>({ mutationKey: MUTATION.clearChecked, scope: scopeOf(listId) })
  return { ...m, mutate: () => m.mutate({ listId }) }
}

/** Amount and unit edits: updates and deletes in one optimistic step. */
export function useEditRows(listId: string) {
  const m = useMutation<void, unknown, EditRowsVars>({ mutationKey: MUTATION.editRows, scope: scopeOf(listId) })
  return { ...m, mutate: (v: RowEdit) => m.mutate({ listId, ...v }) }
}

// ---------- aisles ----------

/** foods.category -> store aisle (77 rows, static). */
const aisleRowsToMap = (rows: { category: string; aisle: string }[]) => new Map(rows.map((r) => [r.category, r.aisle]))

export function useAisleMap() {
  return useQuery({
    queryKey: ['aisle-map'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('aisle_map').select('category, aisle')
      if (error) throw error
      return data
    },
    select: aisleRowsToMap,
  })
}

/** Shared corrections ("sitronsaft" -> Krydder og saus). Small table, refreshed now and then. */
const overrideRowsToMap = (rows: { name_key: string; aisle: string }[]): Map<string, string> =>
  new Map(rows.map((r) => [r.name_key, r.aisle]))

export function useAisleOverrides() {
  return useQuery({
    queryKey: ['aisle-overrides'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('aisle_overrides').select('name_key, aisle')
      if (error) throw error
      return data
    },
    select: overrideRowsToMap,
  })
}

/** Save a correction for everyone. Failing to save is not worth bothering the user about. */
export function useSetAisleOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, aisle }: { name: string; aisle: string }) => {
      const { error } = await supabase.rpc('set_aisle_override', { p_key: overrideKey(name), p_aisle: aisle })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aisle-overrides'] }),
  })
}

export function aisleFor(food: Pick<Food, 'category'> | null | undefined, map: Map<string, string> | undefined): string {
  return (food?.category && map?.get(food.category)) || 'Annet'
}
