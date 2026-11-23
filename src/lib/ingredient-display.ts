// What an ingredient shows for a given servings factor and gram/mål mode.
// Shared by the recipe page and the Markdown export so they always agree.

import { volumeToGrams, type Measures } from './conversion'
import { formatRange, roundForUnit, scaleAmount } from './scaling'

export interface DisplayableIngredient {
  amount: number | null
  amount_max: number | null
  unit: string | null
  scalable: boolean
}

export interface IngredientDisplay {
  amount: number | null
  amountMax: number | null
  unit: string | null
}

export function displayIngredient(
  ing: DisplayableIngredient,
  factor: number,
  grams: boolean,
  measures: Measures | undefined,
): IngredientDisplay {
  const amount = scaleAmount(ing.amount, ing.unit, factor, ing.scalable)
  const amountMax = scaleAmount(ing.amount_max, ing.unit, factor, ing.scalable)

  // "Vis i gram": volume amounts become grams when the food has a measure. Otherwise unchanged.
  if (grams && amount != null && measures) {
    const g = volumeToGrams(amount, ing.unit, measures)
    if (g != null) {
      const gMax = amountMax != null ? volumeToGrams(amountMax, ing.unit, measures) : null
      return {
        amount: roundForUnit(g, 'g'),
        amountMax: gMax != null ? roundForUnit(gMax, 'g') : null,
        unit: 'g',
      }
    }
  }
  return { amount, amountMax, unit: ing.unit }
}

/** "2 dl hvetemel, siktet" */
export function ingredientText(d: IngredientDisplay, name: string, note: string | null): string {
  const qty = [formatRange(d.amount, d.amountMax), d.unit ?? ''].filter(Boolean).join(' ')
  return [qty, name].filter(Boolean).join(' ') + (note ? `, ${note}` : '')
}
