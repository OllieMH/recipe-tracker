// Volume <-> weight conversion. Deterministic: never guesses.
// A conversion needs either a fixed relation (ml/dl/l, ts = 5 ml, ss = 15 ml, krm = 1 ml)
// or a measured value for that food in food_measures.

/** Millilitres per unit, for volume units. */
export const ML_PER_UNIT: Record<string, number> = { ml: 1, dl: 100, l: 1000, krm: 1, ts: 5, ss: 15 }
/** Grams per unit, for weight units. */
export const G_PER_UNIT: Record<string, number> = { g: 1, kg: 1000 }

/** Grams per ONE unit for a food, e.g. { dl: 55, ss: 9, stk: 60 }. */
export type Measures = Record<string, number>

export const isVolume = (u: string | null): u is string => !!u && u in ML_PER_UNIT
export const isWeight = (u: string | null): u is string => !!u && u in G_PER_UNIT

/** Grams per ml, derived from the first volume measure the food has. null = unknown. */
export function gramsPerMl(measures: Measures): number | null {
  for (const u of ['dl', 'ss', 'ts']) {
    if (measures[u]) return measures[u] / ML_PER_UNIT[u]
  }
  return null
}

export function toGrams(amount: number, unit: string | null, measures: Measures): number | null {
  if (!unit) return null
  if (isWeight(unit)) return amount * G_PER_UNIT[unit]
  if (measures[unit]) return amount * measures[unit]
  if (isVolume(unit)) {
    const gpm = gramsPerMl(measures)
    return gpm == null ? null : amount * ML_PER_UNIT[unit] * gpm
  }
  return null
}

export function fromGrams(grams: number, unit: string, measures: Measures): number | null {
  if (isWeight(unit)) return grams / G_PER_UNIT[unit]
  if (measures[unit]) return grams / measures[unit]
  if (isVolume(unit)) {
    const gpm = gramsPerMl(measures)
    return gpm == null ? null : grams / gpm / ML_PER_UNIT[unit]
  }
  return null
}

/** Units shown as alternatives, in display order. */
const ALT_UNITS = ['g', 'ml', 'dl', 'ss', 'ts', 'stk', 'skive', 'fedd', 'neve', 'boks', 'pk', 'bunt']

export interface Alternative {
  unit: string
  amount: number
}

/** All other units this amount can be expressed in. Empty when the food has no usable measures. */
export function alternatives(amount: number, unit: string | null, measures: Measures): Alternative[] {
  const grams = toGrams(amount, unit, measures)
  if (grams == null) return []
  const out: Alternative[] = []
  for (const u of ALT_UNITS) {
    if (u === unit) continue
    const v = fromGrams(grams, u, measures)
    if (v != null && Number.isFinite(v)) out.push({ unit: u, amount: v })
  }
  return out
}

/** Amount in grams when the ingredient is volume-based and convertible; otherwise null. */
export function volumeToGrams(amount: number, unit: string | null, measures: Measures): number | null {
  if (!isVolume(unit)) return null
  return toGrams(amount, unit, measures)
}
