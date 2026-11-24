import { describe, expect, it } from 'vitest'
import { recipeToListItems, type ListableRecipe, type UnitMode } from './recipe-to-list'

const recipe: ListableRecipe = {
  id: 'r1',
  title: 'Boller',
  ingredient_groups: [
    {
      ingredients: [
        { id: 1, name: 'hvetemel', amount: 4, amount_max: null, unit: 'dl', scalable: true, food_id: 10 },
        { id: 2, name: 'salt', amount: null, amount_max: null, unit: null, scalable: false, food_id: null },
      ],
    },
    {
      ingredients: [
        { id: 3, name: 'egg', amount: 1, amount_max: 2, unit: 'stk', scalable: true, food_id: 20 },
        { id: 4, name: 'melk', amount: 600, amount_max: null, unit: 'g', scalable: true, food_id: 30 },
      ],
    },
  ],
}

const aisleOf = (id: number | null) => (id === 10 ? 'Tørrvarer' : id === 20 || id === 30 ? 'Meieri og egg' : 'Annet')
const categoryOf = (id: number | null) => (id === 30 ? 'Melk' : id === 10 ? 'Mel' : null)
const measures = new Map([[10, { dl: 55 }], [30, { dl: 103 }]])
const run = (unitMode: UnitMode, factor = 1) =>
  recipeToListItems(recipe, { factor, unitMode, measuresByFood: measures, aisleOf, categoryOf })

describe('recipeToListItems', () => {
  it('scales to the servings, keeps recipe link and aisle, spans groups, leaves "etter smak" alone', () => {
    const out = run('recipe', 2)
    expect(out.map((o) => o.ingredientId)).toEqual([1, 2, 3, 4])
    expect(out[0].item).toMatchObject({
      name: 'hvetemel', amount: 8, unit: 'dl', food_id: 10, aisle: 'Tørrvarer', recipe_id: 'r1', recipe_title: 'Boller',
    })
    expect(out[1].item).toMatchObject({ name: 'salt', amount: null, unit: null })
    expect(out[2].item).toMatchObject({ amount: 2, amount_max: 4, unit: 'stk', aisle: 'Meieri og egg' })
  })

  it('shopping units: liquids by volume, dry goods by weight, counts untouched', () => {
    const out = run('shopping')
    expect(out[0].item).toMatchObject({ amount: 220, unit: 'g' }) // 4 dl flour
    expect(out[2].item).toMatchObject({ amount: 1, amount_max: 2, unit: 'stk' })
    expect(out[3].item).toMatchObject({ amount: 6, unit: 'dl' }) // 600 g milk
  })

  it('grams mode follows the recipe page toggle', () => {
    expect(run('grams')[0].item).toMatchObject({ amount: 220, unit: 'g' })
    expect(run('grams')[3].item).toMatchObject({ amount: 600, unit: 'g' }) // already grams, stays
  })
})
