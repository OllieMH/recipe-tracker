// Shopping list display logic. Pure and deterministic; no network, no guessing.
//
// Stored rows are never merged in the database. They are combined for display:
//   - same food AND same unit        -> summed automatically
//   - same food, different units     -> a *suggestion* the user decides on, inline
//     on those lines (merge or not, and in which unit)
// A single line can also be converted by hand to any unit that is exactly
// convertible. Confirming either action rewrites the source rows' amount and
// unit in place (convertLines) and remembers the first original in orig_* so it
// can be undone (undoUpdates), also by other members of a shared list.
// Conversions come from src/lib/conversion.ts and only happen when they are
// exact (fixed volume/weight relations) or the food has a measured value.

import { AISLES } from './aisle-list'
import { ML_PER_UNIT, G_PER_UNIT, fromGrams, isVolume, isWeight, toGrams, type Measures } from './conversion'

/** The columns of a shopping_list_items row this module needs. */
export interface MergeItem {
  /** A UUID. The app may make it itself (an item typed while offline), see the item_client_ids migration. */
  id: string
  /** Creation order (a counter in the database). Items with the same position sort by it. */
  seq: number
  name: string
  amount: number | null
  amount_max: number | null
  unit: string | null
  food_id: number | null
  aisle: string
  checked: boolean
  recipe_id: string | null
  recipe_title: string | null
  position: number
  /** Who ticked the item (set by the database); used for "avhuket av …". */
  checked_by?: string | null
  /** What the row was before its first unit conversion; null when never converted. */
  orig_amount: number | null
  orig_amount_max: number | null
  orig_unit: string | null
}

export interface ShoppingLine {
  /** Stable id for React keys: food key + unit. */
  id: string
  /** Groups lines of the same ingredient (food id, or normalised name). */
  foodKey: string
  name: string
  amount: number | null
  amountMax: number | null
  unit: string | null
  aisle: string
  /** True only when every source row is ticked. */
  checked: boolean
  /** Source rows: ticking, converting or deleting the line acts on all of them. */
  items: MergeItem[]
  /** Distinct recipe titles that contributed; empty for free items. */
  recipes: string[]
  /** True when at least one source row was converted and can be undone. */
  canUndo: boolean
}

export interface MergeOption {
  unit: string
  amount: number
  amountMax: number | null
}

export interface MergeSuggestion {
  foodKey: string
  name: string
  lines: ShoppingLine[]
  /** Units every line can be expressed in, own units first. Never empty. */
  options: MergeOption[]
}

/** A write to one row: new amount/unit plus the bookkeeping needed for undo. */
export interface RowUpdate {
  id: string
  amount: number | null
  amount_max: number | null
  unit: string | null
  orig_amount: number | null
  orig_amount_max: number | null
  orig_unit: string | null
}

/** Grams-per-unit tables per food, keyed by food id. */
export type MeasuresByFood = ReadonlyMap<number, Measures>

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export const foodKeyOf = (item: Pick<MergeItem, 'food_id' | 'name'>): string =>
  item.food_id != null ? `f:${item.food_id}` : `n:${normName(item.name)}`

const byOrder = (a: MergeItem, b: MergeItem) => a.position - b.position || a.seq - b.seq

const measuresFor = (foodKey: string, byFood: MeasuresByFood): Measures => {
  const foodId = foodKey.startsWith('f:') ? Number(foodKey.slice(2)) : null
  return (foodId != null ? byFood.get(foodId) : undefined) ?? {}
}

/**
 * Sum rows that share a food and a unit. Rows without an amount ("etter smak")
 * form their own line. Lines of the same food stay next to each other so that a
 * merge prompt can sit inline on them.
 */
export function mergeItems(items: readonly MergeItem[]): ShoppingLine[] {
  const groups = new Map<string, MergeItem[]>()
  for (const item of [...items].sort(byOrder)) {
    const key = `${foodKeyOf(item)}|${item.amount == null ? '' : (item.unit ?? '')}|${item.amount == null ? 'none' : 'amt'}`
    const g = groups.get(key)
    if (g) g.push(item)
    else groups.set(key, [item])
  }

  const lines: ShoppingLine[] = []
  for (const [key, rows] of groups) {
    const first = rows[0]
    const hasAmount = first.amount != null
    let amount: number | null = null
    let amountMax: number | null = null
    if (hasAmount) {
      amount = rows.reduce((s, r) => s + (r.amount ?? 0), 0)
      const anyRange = rows.some((r) => r.amount_max != null && r.amount_max > (r.amount ?? 0))
      amountMax = anyRange ? rows.reduce((s, r) => s + (r.amount_max ?? r.amount ?? 0), 0) : null
    }
    lines.push({
      id: key,
      foodKey: foodKeyOf(first),
      name: first.name,
      amount,
      amountMax,
      unit: hasAmount ? first.unit : null,
      aisle: first.aisle,
      checked: rows.every((r) => r.checked),
      items: rows,
      recipes: [...new Set(rows.map((r) => r.recipe_title).filter((t): t is string => !!t))],
      canUndo: rows.some((r) => r.orig_unit != null),
    })
  }

  // Keep lines of the same ingredient together, in order of first appearance.
  const byFoodKey = new Map<string, ShoppingLine[]>()
  for (const l of lines) {
    const g = byFoodKey.get(l.foodKey)
    if (g) g.push(l)
    else byFoodKey.set(l.foodKey, [l])
  }
  return [...byFoodKey.values()].flat()
}

/** Convert an amount between units, or null when that cannot be done exactly. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  measures: Measures,
): number | null {
  if (from === to) return amount
  // Fixed relations need no food data.
  if (isVolume(from) && isVolume(to)) return (amount * ML_PER_UNIT[from]) / ML_PER_UNIT[to]
  if (isWeight(from) && isWeight(to)) return (amount * G_PER_UNIT[from]) / G_PER_UNIT[to]
  // Everything else goes through grams, which needs a measure for the food.
  const grams = toGrams(amount, from, measures)
  if (grams == null) return null
  return fromGrams(grams, to, measures)
}

/** Units offered when converting, after the units the lines already use. */
const EXTRA_UNITS = ['g', 'kg', 'ml', 'dl', 'l', 'ss', 'ts', 'stk', 'skive', 'fedd', 'neve', 'boks', 'pk', 'bunt']

const clean = (v: number) => Math.round(v * 1000) / 1000

/** Express every line in `unit`, or null when any of them cannot be converted exactly. */
function totalIn(
  group: readonly ShoppingLine[],
  unit: string,
  measures: Measures,
): MergeOption | null {
  let total = 0
  let totalMax = 0
  let anyRange = false
  for (const l of group) {
    if (l.amount == null || l.unit == null) return null
    const a = convertAmount(l.amount, l.unit, unit, measures)
    const m = convertAmount(l.amountMax ?? l.amount, l.unit, unit, measures)
    if (a == null || m == null || !Number.isFinite(a) || !Number.isFinite(m)) return null
    total += a
    totalMax += m
    if (l.amountMax != null && l.amountMax > l.amount) anyRange = true
  }
  return { unit, amount: total, amountMax: anyRange ? totalMax : null }
}

/**
 * For every ingredient that appears on several lines with different units, work
 * out which units they could all be merged into. Ingredients whose lines cannot
 * be converted into any common unit produce no suggestion.
 */
export function suggestMerges(
  lines: readonly ShoppingLine[],
  measuresByFood: MeasuresByFood = new Map(),
): MergeSuggestion[] {
  const byFood = new Map<string, ShoppingLine[]>()
  for (const line of lines) {
    if (line.amount == null || line.unit == null) continue
    const g = byFood.get(line.foodKey)
    if (g) g.push(line)
    else byFood.set(line.foodKey, [line])
  }

  const out: MergeSuggestion[] = []
  for (const [foodKey, group] of byFood) {
    if (group.length < 2) continue
    const measures = measuresFor(foodKey, measuresByFood)
    const candidates = [...new Set([...group.map((l) => l.unit as string), ...EXTRA_UNITS])]
    const options = candidates
      .map((unit) => totalIn(group, unit, measures))
      .filter((o): o is MergeOption => o != null)
    if (options.length > 0) out.push({ foodKey, name: group[0].name, lines: group, options })
  }
  return out
}

/** Units one line can be converted to by hand (other than its own), with the converted amount. */
export function conversionOptions(
  line: ShoppingLine,
  measuresByFood: MeasuresByFood = new Map(),
): MergeOption[] {
  if (line.amount == null || line.unit == null) return []
  const measures = measuresFor(line.foodKey, measuresByFood)
  return EXTRA_UNITS.filter((u) => u !== line.unit)
    .map((unit) => totalIn([line], unit, measures))
    .filter((o): o is MergeOption => o != null)
}

/**
 * Row updates that express the source rows of the given lines in `unit`.
 * The first original (amount, max, unit) is kept in orig_*, so converting twice
 * still undoes back to the very first values.
 */
export function convertLines(
  lines: readonly ShoppingLine[],
  unit: string,
  measuresByFood: MeasuresByFood = new Map(),
): RowUpdate[] {
  const updates: RowUpdate[] = []
  for (const line of lines) {
    const measures = measuresFor(line.foodKey, measuresByFood)
    for (const item of line.items) {
      if (item.amount == null || item.unit == null) continue
      const a = convertAmount(item.amount, item.unit, unit, measures)
      if (a == null || !Number.isFinite(a)) throw new Error(`Cannot convert ${item.unit} to ${unit}`)
      const hasRange = item.amount_max != null && item.amount_max > item.amount
      const m = hasRange ? convertAmount(item.amount_max as number, item.unit, unit, measures) : null
      const keep = item.orig_unit != null
      updates.push({
        id: item.id,
        amount: clean(a),
        amount_max: m == null ? null : clean(m),
        unit,
        orig_amount: keep ? item.orig_amount : item.amount,
        orig_amount_max: keep ? item.orig_amount_max : item.amount_max,
        orig_unit: keep ? item.orig_unit : item.unit,
      })
    }
  }
  return updates
}

/** Units a user can pick when only the label is wrong (the number is kept as it is). */
export const CANONICAL_UNITS = [
  'stk', 'g', 'kg', 'dl', 'l', 'ml', 'ss', 'ts', 'krm', 'fedd', 'pk', 'boks', 'bunt', 'neve', 'klype', 'skive', 'kvist',
]

/** How much the + and - buttons / amount stepper change a line, per unit. */
export function stepFor(unit: string | null): number {
  switch (unit) {
    case 'g':
    case 'ml':
      return 50
    case 'kg':
    case 'l':
    case 'dl':
    case 'ss':
    case 'ts':
      return 0.5
    default:
      return 1
  }
}

/** A few sensible "add this much" buttons for a unit (two or three, not a wall of options). */
export function quickSteps(unit: string | null): number[] {
  switch (unit) {
    case 'g':
    case 'ml':
      return [50, 100, 250]
    case 'kg':
      return [0.1, 0.5, 1]
    case 'l':
      return [0.5, 1, 2]
    case 'dl':
    case 'ss':
    case 'ts':
      return [0.5, 1, 2]
    case 'krm':
      return [1, 2]
    default:
      return [1, 2, 5]
  }
}

export interface LineAdjustment {
  updates: RowUpdate[]
  /** Rows used up by a decrease; delete them. */
  deleteIds: string[]
}

/**
 * Change the total of a line to `newAmount` by editing its source rows:
 *   - more: added to the most recently added row;
 *   - less: taken from the most recently added rows first, deleting a row that
 *     is used up. Recipe contributions older than that are touched last.
 * A manually set amount drops ranges and the undo record of the rows it touches.
 * Throws for lines without an amount, or when newAmount is not above zero.
 */
export function adjustLine(line: ShoppingLine, newAmount: number): LineAdjustment {
  if (line.amount == null) throw new Error('Line has no amount')
  if (!(newAmount > 0) || !Number.isFinite(newAmount)) throw new Error('Amount must be above zero')

  const target = clean(newAmount)
  const delta = clean(target - line.amount)
  if (delta === 0) return { updates: [], deleteIds: [] }

  const touched = (item: MergeItem, amount: number): RowUpdate => ({
    id: item.id,
    amount,
    amount_max: null,
    unit: item.unit,
    orig_amount: null,
    orig_amount_max: null,
    orig_unit: null,
  })

  const rows = line.items
  if (delta > 0) {
    const last = rows[rows.length - 1]
    return { updates: [touched(last, clean((last.amount ?? 0) + delta))], deleteIds: [] }
  }

  let need = -delta
  const updates: RowUpdate[] = []
  const deleteIds: string[] = []
  for (let i = rows.length - 1; i >= 0 && need > 0; i--) {
    const row = rows[i]
    const have = row.amount ?? 0
    if (have > need) {
      updates.push(touched(row, clean(have - need)))
      need = 0
    } else {
      deleteIds.push(row.id)
      need = clean(need - have)
    }
  }
  return { updates, deleteIds }
}

/**
 * Give an amount to a line that has none ("salt", "etter smak"). The first row
 * gets the amount and unit; the other amount-less rows were duplicates and go.
 */
export function giveAmount(line: ShoppingLine, amount: number, unit: string | null): LineAdjustment {
  if (line.amount != null) throw new Error('Line already has an amount')
  if (!(amount > 0) || !Number.isFinite(amount)) throw new Error('Amount must be above zero')
  const [first, ...rest] = line.items
  return {
    updates: [
      {
        id: first.id,
        amount: clean(amount),
        amount_max: null,
        unit,
        orig_amount: null,
        orig_amount_max: null,
        orig_unit: null,
      },
    ],
    deleteIds: rest.map((r) => r.id),
  }
}

/** Change only the unit label of a line (the number stays). Clears undo and keeps ranges. */
export function relabelLine(line: ShoppingLine, unit: string): RowUpdate[] {
  return line.items
    .filter((i) => i.amount != null)
    .map((i) => ({
      id: i.id,
      amount: i.amount,
      amount_max: i.amount_max,
      unit,
      orig_amount: null,
      orig_amount_max: null,
      orig_unit: null,
    }))
}

/** Merge a suggestion into the chosen unit. */
export const applyMerge = (
  suggestion: MergeSuggestion,
  unit: string,
  measuresByFood: MeasuresByFood = new Map(),
): RowUpdate[] => convertLines(suggestion.lines, unit, measuresByFood)

/** Restore the original amount and unit of every converted source row of these lines. */
export function undoUpdates(lines: readonly ShoppingLine[]): RowUpdate[] {
  return lines
    .flatMap((l) => l.items)
    .filter((i) => i.orig_unit != null)
    .map((i) => ({
      id: i.id,
      amount: i.orig_amount,
      amount_max: i.orig_amount_max,
      unit: i.orig_unit,
      orig_amount: null,
      orig_amount_max: null,
      orig_unit: null,
    }))
}

/**
 * Decimal text with a comma, no fractions. g and ml are whole numbers; other
 * units keep up to two decimals without trailing zeros: 255 g, 3,3 dl, 1,5 ss.
 */
export function formatDecimal(value: number, unit: string | null): string {
  if (!Number.isFinite(value)) return ''
  const whole = unit === 'g' || unit === 'ml'
  let v = whole ? Math.round(value) : Math.round(value * 100) / 100
  if (v === 0 && value > 0) v = whole ? 1 : 0.01 // never show a real amount as 0
  return String(v).replace('.', ',')
}

/** "7 dl", "1–2 dl", "255 g", or "" for lines without an amount. */
export function formatLineAmount(line: Pick<ShoppingLine, 'amount' | 'amountMax' | 'unit'>): string {
  if (line.amount == null) return ''
  const a = formatDecimal(line.amount, line.unit)
  const m = line.amountMax != null && line.amountMax > line.amount ? formatDecimal(line.amountMax, line.unit) : null
  const text = m != null && m !== a ? `${a}–${m}` : a
  return line.unit ? `${text} ${line.unit}` : text
}

/** Sections in the default shopping order (see aisles.ts). */
export const AISLE_ORDER: readonly string[] = AISLES

/** Lines grouped by section, in `order` (a list's own order); unknown sections sort just before "Annet". */
export function groupByAisle<T extends { aisle: string }>(
  lines: readonly T[],
  order: readonly string[] = AISLE_ORDER,
): { aisle: string; lines: T[] }[] {
  const rank = (a: string) => {
    if (a === 'Annet') return order.length + 1
    const i = order.indexOf(a)
    return i === -1 ? order.length : i
  }
  const groups = new Map<string, T[]>()
  for (const l of lines) {
    const g = groups.get(l.aisle)
    if (g) g.push(l)
    else groups.set(l.aisle, [l])
  }
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([aisle, ls]) => ({ aisle, lines: ls }))
}
