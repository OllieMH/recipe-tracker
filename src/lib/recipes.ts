import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Measures } from './conversion'

// ---------- list ----------

export async function fetchRecipeList() {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, owner_id, parent_id, visibility, title, description, tags, servings, servings_unit, total_minutes, image_path, created_at, ingredient_groups(ingredients(name))',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export type RecipeListItem = Awaited<ReturnType<typeof fetchRecipeList>>[number]

export function useRecipeList() {
  return useQuery({ queryKey: ['recipes', 'list'], queryFn: fetchRecipeList })
}

/** Search over title, tags and ingredient names; every word must match somewhere. */
export function recipeMatches(r: RecipeListItem, q: string): boolean {
  if (!q) return true
  const hay = [r.title, ...r.tags, ...r.ingredient_groups.flatMap((g) => g.ingredients.map((i) => i.name))].map((s) =>
    s.toLowerCase(),
  )
  return q.split(/\s+/).every((word) => hay.some((h) => h.includes(word)))
}

/** If you have a private copy of a recipe, the copy is shown instead of the original. */
export function visibleRecipes(all: RecipeListItem[], userId: string | undefined): RecipeListItem[] {
  const replaced = new Set(all.filter((r) => r.parent_id && r.owner_id === userId).map((r) => r.parent_id))
  return all.filter((r) => !replaced.has(r.id))
}

// ---------- detail ----------

const DETAIL_SELECT = '*, ingredient_groups(*, ingredients(*)), steps(*)'

type RawDetail = NonNullable<Awaited<ReturnType<typeof fetchRawRecipe>>>

async function fetchRawRecipe(id: string) {
  const { data, error } = await supabase.from('recipes').select(DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

function normalizeRecipe(data: RawDetail) {
  return {
    ...data,
    ingredient_groups: [...data.ingredient_groups]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ ...g, ingredients: [...g.ingredients].sort((a, b) => a.position - b.position) })),
    steps: [...data.steps].sort((a, b) => a.position - b.position),
  }
}

export async function fetchRecipe(id: string) {
  const data = await fetchRawRecipe(id)
  return data ? normalizeRecipe(data) : null
}
export type RecipeDetail = NonNullable<Awaited<ReturnType<typeof fetchRecipe>>>

/** Several recipes in one request (used by the favourites export). */
export async function fetchRecipes(ids: string[]): Promise<RecipeDetail[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('recipes').select(DETAIL_SELECT).in('id', ids)
  if (error) throw error
  return data.map(normalizeRecipe)
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ['recipes', 'detail', id],
    enabled: !!id,
    queryFn: () => fetchRecipe(id!),
  })
}

/** The signed-in user's private copy of a recipe, if any (for the "Din versjon" link). */
export function useMyCopyOf(recipeId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['recipes', 'copy-of', recipeId, userId],
    enabled: !!recipeId && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, created_at')
        .eq('parent_id', recipeId!)
        .eq('owner_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** The original of a private copy: title and last-changed time, for the staleness note. */
export function useParent(parentId: string | null | undefined) {
  return useQuery({
    queryKey: ['recipes', 'parent', parentId],
    enabled: !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, updated_at')
        .eq('id', parentId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

// ---------- favourites ----------

export function useFavorites(userId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('favorites').select('recipe_id')
      if (error) throw error
      return new Set(data.map((f) => f.recipe_id))
    },
  })
}

export function useToggleFavorite(userId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ recipeId, favorite }: { recipeId: string; favorite: boolean }) => {
      if (!userId) throw new Error('not signed in')
      if (favorite) {
        const { error } = await supabase.from('favorites').insert({ recipe_id: recipeId, user_id: userId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('favorites').delete().eq('recipe_id', recipeId).eq('user_id', userId)
        if (error) throw error
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['favorites', userId] }),
  })
}

// ---------- food measures ----------

/** food_id -> { unit: grams per one unit } for the given foods. */
export async function fetchMeasures(foodIds: number[]): Promise<Map<number, Measures>> {
  const ids = [...new Set(foodIds)].sort((a, b) => a - b)
  const map = new Map<number, Measures>()
  if (ids.length === 0) return map
  const { data, error } = await supabase
    .from('food_measures')
    .select('food_id, unit, grams')
    .in('food_id', ids)
  if (error) throw error
  for (const m of data) {
    const cur = map.get(m.food_id) ?? {}
    cur[m.unit] = Number(m.grams)
    map.set(m.food_id, cur)
  }
  return map
}

export function useMeasures(foodIds: number[]) {
  const ids = [...new Set(foodIds)].sort((a, b) => a - b)
  return useQuery({
    queryKey: ['measures', ids],
    enabled: ids.length > 0,
    staleTime: Infinity,
    queryFn: () => fetchMeasures(ids),
  })
}

// ---------- helpers ----------

export function formatMinutes(min: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`
}
