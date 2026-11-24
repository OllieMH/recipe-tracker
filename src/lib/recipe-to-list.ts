// Turns a recipe's ingredients into shopping list items, exactly as the recipe
// page shows them (current servings, gram or measure mode). Pure.

import type { Measures } from './conversion'
import { displayIngredient } from './ingredient-display'
import { preferredKind, toPreferredUnit } from './preferred-unit'
import type { NewItem } from './shopping'

/**
 * shopping: the unit you buy it in (6 dl melk, 220 g mel)
 * recipe:   as written in the recipe (scaled)
 * grams:    volumes in grams where the food has a measure
 */
export type UnitMode = 'shopping' | 'recipe' | 'grams'

export interface ListableIngredient {
  id: number
  name: string
  amount: number | null
  amount_max: number | null
  unit: string | null
  scalable: boolean
  food_id: number | null
}

export interface ListableRecipe {
  id: string
  title: string
  ingredient_groups: { ingredients: ListableIngredient[] }[]
}

export interface RecipeListItem {
  /** The recipe ingredient this came from, so the UI can let people untick it. */
  ingredientId: number
  item: NewItem
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

export function recipeToListItems(
  recipe: ListableRecipe,
  opts: {
    factor: number
    unitMode: UnitMode
    measuresByFood: ReadonlyMap<number, Measures> | undefined
    /** Store aisle for an ingredient (by food id, or by name when the user has corrected it before). */
    aisleOf: (foodId: number | null, name: string) => string
    /** foods.category for a food id, used to decide between volume and weight. */
    categoryOf: (foodId: number | null) => string | null
  },
): RecipeListItem[] {
  return recipe.ingredient_groups.flatMap((g) =>
    g.ingredients.map((ing) => {
      const measures = ing.food_id != null ? opts.measuresByFood?.get(ing.food_id) : undefined
      const scaled = displayIngredient(
        { amount: num(ing.amount), amount_max: num(ing.amount_max), unit: ing.unit, scalable: ing.scalable },
        opts.factor,
        opts.unitMode === 'grams',
        measures,
      )
      const shown =
        opts.unitMode === 'shopping' ? toPreferredUnit(scaled, preferredKind(opts.categoryOf(ing.food_id)), measures) : scaled
      return {
        ingredientId: ing.id,
        item: {
          name: ing.name,
          amount: shown.amount,
          amount_max: shown.amountMax,
          unit: shown.unit,
          food_id: ing.food_id,
          aisle: opts.aisleOf(ing.food_id, ing.name),
          recipe_id: recipe.id,
          recipe_title: recipe.title,
        },
      }
    }),
  )
}
