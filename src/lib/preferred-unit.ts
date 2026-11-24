// "Shopping units": express an ingredient in the unit you would actually buy it
// in. Liquids in dl / l (6 dl melk, not 600 g), dry goods in g / kg (220 g mel,
// not 4 dl). Cooking measures (ss, ts, krm) and counts (stk, fedd, ...) stay as
// written. A conversion needs the food's measured value (never guessed); without
// one the amount is left as it is. Pure.

import type { Measures } from './conversion'
import type { IngredientDisplay } from './ingredient-display'
import { convertAmount } from './shopping-merge'

export type UnitKind = 'volume' | 'weight'

/** Foods.category values that are bought by volume. Everything else is bought by weight. */
const VOLUME_CATEGORIES = new Set([
  'Melk',
  'Fløte og rømme',
  'Yoghurt',
  'Plantebasert drikke',
  'Matolje',
  'Juice og smoothie',
  'Brus og energidrikke',
  'Vann og mineralvann',
  'Alkoholholdige drikkevarer',
])

export const preferredKind = (category: string | null | undefined): UnitKind =>
  category && VOLUME_CATEGORIES.has(category) ? 'volume' : 'weight'

const VOLUME_UNITS = ['ml', 'dl', 'l']
const WEIGHT_UNITS = ['g', 'kg']

// Crossing from weight to volume (or back) goes through a density that is only
// approximately right, so the result is rounded to a sensible shopping amount.
const roundDl = (x: number) => Math.max(0.5, Math.round(x * 2) / 2)
const roundG = (x: number) => (x >= 100 ? Math.round(x / 5) * 5 : Math.max(1, Math.round(x)))

/** 12 dl -> 1,2 l and 1500 g -> 1,5 kg. */
function tidy(d: IngredientDisplay): IngredientDisplay {
  if (d.amount == null) return d
  const big = d.unit === 'dl' ? d.amount >= 10 : d.unit === 'g' ? d.amount >= 1000 : false
  if (!big) return d
  const div = d.unit === 'dl' ? 10 : 1000
  return {
    amount: d.amount / div,
    amountMax: d.amountMax != null ? d.amountMax / div : null,
    unit: d.unit === 'dl' ? 'l' : 'kg',
  }
}

export function toPreferredUnit(d: IngredientDisplay, kind: UnitKind, measures: Measures | undefined): IngredientDisplay {
  const { amount, amountMax, unit } = d
  if (amount == null || unit == null) return d
  const isVolume = VOLUME_UNITS.includes(unit)
  const isWeight = WEIGHT_UNITS.includes(unit)
  if (!isVolume && !isWeight) return d // ss, ts, stk, ... stay as written

  const sameFamily = kind === 'volume' ? isVolume : isWeight
  if (sameFamily && unit === 'ml' && amount < 100) return d // a splash stays in ml

  const target = kind === 'volume' ? 'dl' : 'g'
  const a = convertAmount(amount, unit, target, measures ?? {})
  const m = amountMax != null ? convertAmount(amountMax, unit, target, measures ?? {}) : null
  if (a == null || (amountMax != null && m == null)) return d // no measure for this food: keep as written

  const round = sameFamily ? (x: number) => x : target === 'dl' ? roundDl : roundG
  return tidy({ amount: round(a), amountMax: m == null ? null : round(m), unit: target })
}
