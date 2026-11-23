import { describe, expect, it } from 'vitest'
import type { ExportableRecipe } from './markdown'
import { recipeToPlainText } from './plaintext'

const recipe = (): ExportableRecipe => ({
  title: 'Pannekaker',
  description: null,
  servings: 4,
  servings_unit: 'porsjoner',
  total_minutes: 30,
  source_url: 'https://example.com/pannekaker',
  tags: [],
  tips: ['Server med syltetøy.'],
  ingredient_groups: [
    {
      name: null,
      ingredients: [
        { amount: 2, amount_max: null, unit: 'dl', name: 'mel', note: 'siktet', scalable: true, food_id: null },
        { amount: 1, amount_max: null, unit: 'ts', name: 'salt', note: null, scalable: false, food_id: null },
      ],
    },
    {
      name: 'Til steking',
      ingredients: [{ amount: null, amount_max: null, unit: null, name: 'smør', note: null, scalable: false, food_id: null }],
    },
  ],
  steps: [
    { group_name: null, text: 'Bland.' },
    { group_name: null, text: 'Stek.' },
  ],
})

describe('recipeToPlainText', () => {
  it('formats a readable message', () => {
    expect(recipeToPlainText(recipe())).toBe(`Pannekaker
4 porsjoner · Totalt 30 min

INGREDIENSER
- 2 dl mel, siktet
- 1 ts salt

Til steking:
- smør

FREMGANGSMÅTE
1. Bland.
2. Stek.

TIPS
- Server med syltetøy.

Kilde: https://example.com/pannekaker
`)
  })

  it('uses the shown servings', () => {
    const t = recipeToPlainText(recipe(), { servings: 8 })
    expect(t).toContain('8 porsjoner')
    expect(t).toContain('- 4 dl mel, siktet')
    expect(t).toContain('- 1 ts salt')
  })
})
