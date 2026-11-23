import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Measures } from './conversion'

// ---------- list ----------

export async function fetchRecipeList() {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, owner_id, parent_id, visibility, title, description, tags, servings, servings_unit, total_minutes, created_at, ingredient_groups(ingredients(name))',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export type RecipeListItem = Awaited<ReturnType<typeof fetchRecipeList>>[number]

export function useRecipeList() {
  return useQuery({ queryKey: ['recipes', 'list'], queryFn: fetchRecipeList })
}

// ---------- detail ----------

export async function fetchRecipe(id: string) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, ingredient_groups(*, ingredients(*)), steps(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    ...data,
    ingredient_groups: [...data.ingredient_groups]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ ...g, ingredients: [...g.ingredients].sort((a, b) => a.position - b.position) })),
    steps: [...data.steps].sort((a, b) => a.position - b.position),
  }
}
export type RecipeDetail = NonNullable<Awaited<ReturnType<typeof fetchRecipe>>>

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
export function useMeasures(foodIds: number[]) {
  const ids = [...new Set(foodIds)].sort((a, b) => a - b)
  return useQuery({
    queryKey: ['measures', ids],
    enabled: ids.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_measures')
        .select('food_id, unit, grams')
        .in('food_id', ids)
      if (error) throw error
      const map = new Map<number, Measures>()
      for (const m of data) {
        const cur = map.get(m.food_id) ?? {}
        cur[m.unit] = Number(m.grams)
        map.set(m.food_id, cur)
      }
      return map
    },
  })
}

// ---------- helpers ----------

export function formatMinutes(min: number | null): string {
  if (!min) return ''
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`
}
