import { describe, expect, it } from 'vitest'
import {
  adjustLine,
  applyMerge,
  conversionOptions,
  convertLines,
  formatDecimal,
  formatLineAmount,
  giveAmount,
  groupByAisle,
  mergeItems,
  quickSteps,
  relabelLine,
  stepFor,
  suggestMerges,
  undoUpdates,
  type MeasuresByFood,
  type MergeItem,
} from './shopping-merge'

let nextId = 1
function item(p: Partial<MergeItem> & Pick<MergeItem, 'name'>): MergeItem {
  const n = nextId++
  return {
    id: `row-${n}`, // ids are UUID strings; creation order is `seq`
    seq: n,
    amount: null,
    amount_max: null,
    unit: null,
    food_id: null,
    aisle: 'Annet',
    checked: false,
    recipe_id: null,
    recipe_title: null,
    position: 0,
    orig_amount: null,
    orig_amount_max: null,
    orig_unit: null,
    ...p,
  }
}

/** Apply row updates to rows, like the database would. */
function applyRows(rows: MergeItem[], updates: ReturnType<typeof convertLines>): MergeItem[] {
  return rows.map((r) => {
    const u = updates.find((x) => x.id === r.id)
    return u ? { ...r, ...u } : r
  })
}

const lineOf = (...rows: MergeItem[]) => mergeItems(rows)[0]

// Flour: 1 dl weighs 55 g.
const measures: MeasuresByFood = new Map([[10, { dl: 55 }]])

describe('mergeItems', () => {
  it('sums rows with the same food and unit, in row order, keeping the sources', () => {
    const late = item({ name: 'mel', food_id: 10, amount: 4, unit: 'dl', position: 2, recipe_title: 'Brød' })
    const early = item({ name: 'hvetemel', food_id: 10, amount: 3, unit: 'dl', position: 1, recipe_title: 'Boller' })
    const lines = mergeItems([late, early])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ amount: 7, unit: 'dl', name: 'hvetemel', recipes: ['Boller', 'Brød'] })
    expect(lines[0].items.map((i) => i.id)).toEqual([early.id, late.id])
  })

  it('keeps different units of one food on separate lines, next to each other', () => {
    const lines = mergeItems([
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl', position: 1 }),
      item({ name: 'melk', food_id: 20, amount: 1, unit: 'l', position: 2 }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g', position: 3 }),
    ])
    expect(lines.map((l) => `${l.name}:${l.unit}`)).toEqual(['mel:dl', 'mel:g', 'melk:l'])
  })

  it('groups foodless items by normalised name', () => {
    const lines = mergeItems([
      item({ name: 'Melk ', amount: 1, unit: 'l' }),
      item({ name: 'melk', amount: 2, unit: 'l' }),
      item({ name: 'smør', amount: 1, unit: 'l' }),
    ])
    expect(lines).toHaveLength(2)
    expect(lines.find((l) => l.name.toLowerCase().startsWith('melk'))?.amount).toBe(3)
  })

  it('shows amount-less rows once, apart from rows with amounts', () => {
    const lines = mergeItems([
      item({ name: 'salt', food_id: 5 }),
      item({ name: 'salt', food_id: 5 }),
      item({ name: 'salt', food_id: 5, amount: 1, unit: 'ts' }),
    ])
    expect(lines).toHaveLength(2)
    const none = lines.find((l) => l.amount == null)!
    expect(none.items).toHaveLength(2)
    expect(formatLineAmount(none)).toBe('')
  })

  it('sums ranges', () => {
    const line = lineOf(
      item({ name: 'løk', food_id: 3, amount: 1, amount_max: 2, unit: 'stk' }),
      item({ name: 'løk', food_id: 3, amount: 2, unit: 'stk' }),
    )
    expect(line).toMatchObject({ amount: 3, amountMax: 4 })
    expect(formatLineAmount(line)).toBe('3–4 stk')
  })

  it('is ticked only when every row is ticked, and flags undoable lines', () => {
    expect(lineOf(item({ name: 'a', amount: 1, checked: true }), item({ name: 'a', amount: 1, checked: true })).checked).toBe(true)
    expect(lineOf(item({ name: 'b', amount: 1, checked: true }), item({ name: 'b', amount: 1 })).checked).toBe(false)
    expect(lineOf(item({ name: 'c', amount: 1, unit: 'l' })).canUndo).toBe(false)
    expect(lineOf(item({ name: 'd', amount: 10, unit: 'dl', orig_amount: 1, orig_unit: 'l' })).canUndo).toBe(true)
  })
})

describe('suggestMerges / conversionOptions', () => {
  it('offers volume and weight units when the food has a measure, own units first', () => {
    const lines = mergeItems([
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' }),
    ])
    const [s] = suggestMerges(lines, measures)
    expect(s.options.find((o) => o.unit === 'g')!.amount).toBeCloseTo(255)
    expect(s.options.find((o) => o.unit === 'dl')!.amount).toBeCloseTo(1 + 200 / 55)
    expect(s.options.slice(0, 2).map((o) => o.unit).sort()).toEqual(['dl', 'g'])
  })

  it('without a measure only offers units within the same family', () => {
    const lines = mergeItems([
      item({ name: 'fløte', food_id: 99, amount: 3, unit: 'dl' }),
      item({ name: 'fløte', food_id: 99, amount: 2, unit: 'ss' }),
    ])
    const [s] = suggestMerges(lines)
    const units = s.options.map((o) => o.unit)
    expect(units).toEqual(expect.arrayContaining(['dl', 'ml']))
    expect(units).not.toContain('g')
    expect(s.options.find((o) => o.unit === 'dl')!.amount).toBeCloseTo(3.3)
  })

  it('makes no suggestion when nothing can be combined', () => {
    const cases = [
      [item({ name: 'løk', food_id: 7, amount: 1, unit: 'stk' }), item({ name: 'løk', food_id: 7, amount: 2, unit: 'dl' })], // no common unit
      [item({ name: 'melk', amount: 1, unit: 'l' })], // single line
      [item({ name: 'salt' }), item({ name: 'salt', amount: 1, unit: 'ts' })], // amount-less
      [item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }), item({ name: 'sukker', food_id: 11, amount: 200, unit: 'g' })], // different foods
    ]
    for (const rows of cases) expect(suggestMerges(mergeItems(rows), measures)).toEqual([])
  })

  it('lists the units one line converts to exactly, never its own or a guess', () => {
    const withMeasure = conversionOptions(lineOf(item({ name: 'mel', food_id: 10, amount: 2, unit: 'dl' })), measures)
    expect(withMeasure.map((o) => o.unit)).toEqual(expect.arrayContaining(['g', 'ml']))
    expect(withMeasure.map((o) => o.unit)).not.toContain('dl')
    expect(withMeasure.find((o) => o.unit === 'g')!.amount).toBeCloseTo(110)

    const noMeasure = conversionOptions(lineOf(item({ name: 'fløte', food_id: 99, amount: 2, unit: 'dl' }))).map((o) => o.unit)
    expect(noMeasure).toContain('ss')
    expect(noMeasure).not.toContain('g')

    expect(conversionOptions(lineOf(item({ name: 'salt' })))).toEqual([])
    expect(conversionOptions(lineOf(item({ name: 'egg', amount: 3 })))).toEqual([])
  })
})

describe('convertLines / applyMerge', () => {
  it('rewrites every source row in the chosen unit and remembers the originals', () => {
    const a = item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' })
    const b = item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' })
    const [s] = suggestMerges(mergeItems([a, b]), measures)
    expect(applyMerge(s, 'g', measures)).toEqual([
      { id: a.id, amount: 55, amount_max: null, unit: 'g', orig_amount: 1, orig_amount_max: null, orig_unit: 'dl' },
      { id: b.id, amount: 200, amount_max: null, unit: 'g', orig_amount: 200, orig_amount_max: null, orig_unit: 'g' },
    ])
  })

  it('after a merge or a manual conversion the rows sum into one line', () => {
    const rows = [
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' }),
    ]
    const [s] = suggestMerges(mergeItems(rows), measures)
    expect(mergeItems(applyRows(rows, applyMerge(s, 'g', measures)))[0]).toMatchObject({ amount: 255, unit: 'g', canUndo: true })

    const single = [item({ name: 'mel', food_id: 10, amount: 2, unit: 'dl' })]
    expect(mergeItems(applyRows(single, convertLines(mergeItems(single), 'g', measures)))[0]).toMatchObject({ amount: 110, unit: 'g' })
  })

  it('converts ranges and leaves recipe links alone', () => {
    const a = item({ name: 'fløte', food_id: 99, amount: 1, amount_max: 2, unit: 'dl', recipe_id: 'r1' })
    const b = item({ name: 'fløte', food_id: 99, amount: 2, unit: 'ss', recipe_id: 'r2' })
    const updates = applyMerge(suggestMerges(mergeItems([a, b]))[0], 'ml')
    expect(updates.find((u) => u.id === a.id)).toMatchObject({ amount: 100, amount_max: 200, unit: 'ml' })
    expect(updates.find((u) => u.id === b.id)).toMatchObject({ amount: 30, amount_max: null, unit: 'ml' })
    expect(Object.keys(updates[0])).not.toContain('recipe_id')
  })

  it('refuses an impossible conversion', () => {
    const [s] = suggestMerges(mergeItems([
      item({ name: 'fløte', food_id: 99, amount: 1, unit: 'dl' }),
      item({ name: 'fløte', food_id: 99, amount: 2, unit: 'ss' }),
    ]))
    expect(() => applyMerge(s, 'g')).toThrow()
  })
})

describe('undoUpdates', () => {
  it('restores a merge to two separate lines', () => {
    const rows = [
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl', recipe_title: 'A' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g', recipe_title: 'B' }),
    ]
    const [s] = suggestMerges(mergeItems(rows), measures)
    const converted = applyRows(rows, applyMerge(s, 'g', measures))
    const restored = applyRows(converted, undoUpdates(mergeItems(converted)))
    expect(restored.map((r) => [r.amount, r.unit, r.orig_unit])).toEqual([[1, 'dl', null], [200, 'g', null]])
    expect(mergeItems(restored)).toHaveLength(2)
  })

  it('goes back to the very first amount after several conversions', () => {
    let rows = [item({ name: 'mel', food_id: 10, amount: 2, unit: 'dl' })]
    rows = applyRows(rows, convertLines(mergeItems(rows), 'g', measures)) // 110 g
    rows = applyRows(rows, convertLines(mergeItems(rows), 'ml', measures)) // 200 ml
    expect(rows[0]).toMatchObject({ amount: 200, unit: 'ml', orig_amount: 2, orig_unit: 'dl' })
    rows = applyRows(rows, undoUpdates(mergeItems(rows)))
    expect(rows[0]).toMatchObject({ amount: 2, unit: 'dl', orig_unit: null })
  })

  it('restores ranges, and does nothing for lines that were never converted', () => {
    let rows = [item({ name: 'fløte', food_id: 99, amount: 1, amount_max: 2, unit: 'dl' })]
    rows = applyRows(rows, convertLines(mergeItems(rows), 'ml'))
    rows = applyRows(rows, undoUpdates(mergeItems(rows)))
    expect(rows[0]).toMatchObject({ amount: 1, amount_max: 2, unit: 'dl' })
    expect(undoUpdates(mergeItems(rows))).toEqual([])
  })
})

describe('editing a line', () => {
  it('adjustLine: an increase goes to the newest row', () => {
    const a = item({ name: 'egg', amount: 2, position: 1, recipe_title: 'Kake' })
    const b = item({ name: 'egg', amount: 1, position: 2 })
    const { updates, deleteIds } = adjustLine(lineOf(a, b), 5)
    expect(deleteIds).toEqual([])
    expect(updates).toEqual([expect.objectContaining({ id: b.id, amount: 3 })])
  })

  it('adjustLine: a decrease takes from the newest rows first and deletes rows used up', () => {
    const a = item({ name: 'egg', amount: 3, position: 1 })
    const b = item({ name: 'egg', amount: 1, position: 2 })
    const c = item({ name: 'egg', amount: 1, position: 3 })
    const { updates, deleteIds } = adjustLine(lineOf(a, b, c), 2)
    expect(deleteIds).toEqual([c.id, b.id])
    expect(updates).toEqual([expect.objectContaining({ id: a.id, amount: 2 })])

    const solo = item({ name: 'melk', amount: 5, unit: 'dl' })
    expect(adjustLine(lineOf(solo), 3.5)).toMatchObject({ deleteIds: [], updates: [{ id: solo.id, amount: 3.5, unit: 'dl' }] })
  })

  it('adjustLine: drops ranges and the undo record of touched rows', () => {
    const a = item({ name: 'fløte', amount: 1, amount_max: 2, unit: 'dl', orig_amount: 1, orig_unit: 'ss' })
    expect(adjustLine(lineOf(a), 3).updates[0]).toMatchObject({
      amount: 3, amount_max: null, orig_amount: null, orig_amount_max: null, orig_unit: null,
    })
  })

  it('adjustLine: no-op when unchanged, rejects zero, negative and amount-less lines', () => {
    const egg = lineOf(item({ name: 'egg', amount: 2 }))
    expect(adjustLine(egg, 2)).toEqual({ updates: [], deleteIds: [] })
    expect(() => adjustLine(egg, 0)).toThrow()
    expect(() => adjustLine(egg, -1)).toThrow()
    expect(() => adjustLine(lineOf(item({ name: 'salt' })), 1)).toThrow()
  })

  it('giveAmount: sets the first amount-less row and removes the duplicates', () => {
    const a = item({ name: 'salt', food_id: 5 })
    const b = item({ name: 'salt', food_id: 5 })
    expect(giveAmount(lineOf(a, b), 2, 'ts')).toEqual({
      updates: [{ id: a.id, amount: 2, amount_max: null, unit: 'ts', orig_amount: null, orig_amount_max: null, orig_unit: null }],
      deleteIds: [b.id],
    })
    expect(() => giveAmount(lineOf(item({ name: 'egg', amount: 2 })), 3, null)).toThrow()
  })

  it('relabelLine: changes only the unit, so the line merges with others of that unit', () => {
    const rows = [
      item({ name: 'egg', food_id: 1, amount: 2, amount_max: 3 }),
      item({ name: 'egg', food_id: 1, amount: 4, unit: 'stk' }),
    ]
    const bare = mergeItems(rows).find((l) => l.unit == null)!
    const updates = relabelLine(bare, 'stk')
    expect(updates).toEqual([
      { id: rows[0].id, amount: 2, amount_max: 3, unit: 'stk', orig_amount: null, orig_amount_max: null, orig_unit: null },
    ])
    expect(mergeItems(applyRows(rows, updates))).toHaveLength(1)
  })

  it('has a few sensible step sizes per unit', () => {
    expect([stepFor(null), stepFor('g'), stepFor('dl')]).toEqual([1, 50, 0.5])
    for (const u of ['g', 'ml', 'kg', 'l', 'dl', 'ss', 'ts', 'krm', 'stk', 'pk', null]) {
      const steps = quickSteps(u)
      expect(steps.length).toBeGreaterThanOrEqual(2)
      expect(steps.length).toBeLessThanOrEqual(3)
      expect([...steps].sort((x, y) => x - y)).toEqual(steps)
    }
  })
})

describe('formatting', () => {
  it('uses decimals with a comma: whole g/ml, up to two decimals otherwise, never 0', () => {
    const cases: [number, string | null, string][] = [
      [255.4, 'g', '255'], [99.6, 'ml', '100'], [3.3, 'dl', '3,3'], [3.25, 'dl', '3,25'],
      [3.254, 'dl', '3,25'], [7, 'dl', '7'], [2, null, '2'], [0.2, 'g', '1'], [0.001, 'dl', '0,01'],
    ]
    for (const [value, unit, expected] of cases) expect(formatDecimal(value, unit)).toBe(expected)
  })

  it('formats whole lines, with ranges and without amounts', () => {
    expect(formatLineAmount({ amount: 3.3, amountMax: null, unit: 'dl' })).toBe('3,3 dl')
    expect(formatLineAmount({ amount: 1, amountMax: 2, unit: 'dl' })).toBe('1–2 dl')
    expect(formatLineAmount({ amount: 2, amountMax: null, unit: null })).toBe('2')
    expect(formatLineAmount({ amount: null, amountMax: null, unit: 'dl' })).toBe('')
  })

  it('orders aisles for shopping and puts unknown aisles before Annet', () => {
    const groups = groupByAisle([{ aisle: 'Annet' }, { aisle: 'Meieri og egg' }, { aisle: 'Frukt og grønt' }, { aisle: 'Ukjent' }])
    expect(groups.map((g) => g.aisle)).toEqual(['Frukt og grønt', 'Meieri og egg', 'Ukjent', 'Annet'])
  })

  it('follows a list’s own order', () => {
    const lines = [{ aisle: 'Frukt og grønt' }, { aisle: 'Kjøtt og fisk' }, { aisle: 'Annet' }]
    const groups = groupByAisle(lines, ['Kjøtt og fisk', 'Frukt og grønt', 'Annet'])
    expect(groups.map((g) => g.aisle)).toEqual(['Kjøtt og fisk', 'Frukt og grønt', 'Annet'])
  })
})
