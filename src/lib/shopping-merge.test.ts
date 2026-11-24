import { describe, expect, it } from 'vitest'
import {
  applyMerge,
  conversionOptions,
  convertAmount,
  convertLines,
  formatDecimal,
  formatLineAmount,
  groupByAisle,
  mergeItems,
  suggestMerges,
  undoUpdates,
  type MergeItem,
  type MeasuresByFood,
} from './shopping-merge'

let nextId = 1
function item(p: Partial<MergeItem> & Pick<MergeItem, 'name'>): MergeItem {
  return {
    id: nextId++,
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

// Flour: 1 dl weighs 55 g.
const measures: MeasuresByFood = new Map([[10, { dl: 55 }]])

describe('mergeItems', () => {
  it('sums rows with the same food and unit and keeps the source rows', () => {
    const a = item({ name: 'hvetemel', food_id: 10, amount: 3, unit: 'dl', recipe_title: 'Boller' })
    const b = item({ name: 'mel', food_id: 10, amount: 4, unit: 'dl', recipe_title: 'Brød' })
    const lines = mergeItems([a, b])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ amount: 7, unit: 'dl', name: 'hvetemel' })
    expect(lines[0].items.map((i) => i.id)).toEqual([a.id, b.id])
    expect(lines[0].recipes).toEqual(['Boller', 'Brød'])
  })

  it('keeps different units of the same food on separate lines', () => {
    const lines = mergeItems([
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' }),
    ])
    expect(lines.map((l) => l.unit).sort()).toEqual(['dl', 'g'])
  })

  it('keeps lines of the same food next to each other', () => {
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

  it('shows rows without an amount once, apart from rows with amounts', () => {
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
    const lines = mergeItems([
      item({ name: 'løk', food_id: 3, amount: 1, amount_max: 2, unit: 'stk' }),
      item({ name: 'løk', food_id: 3, amount: 2, unit: 'stk' }),
    ])
    expect(lines[0]).toMatchObject({ amount: 3, amountMax: 4 })
    expect(formatLineAmount(lines[0])).toBe('3–4 stk')
  })

  it('is ticked only when every source row is ticked', () => {
    const both = mergeItems([
      item({ name: 'melk', amount: 1, unit: 'l', checked: true }),
      item({ name: 'melk', amount: 1, unit: 'l', checked: true }),
    ])
    expect(both[0].checked).toBe(true)
    const partial = mergeItems([
      item({ name: 'melk', amount: 1, unit: 'l', checked: true }),
      item({ name: 'melk', amount: 1, unit: 'l', checked: false }),
    ])
    expect(partial[0].checked).toBe(false)
  })

  it('orders source rows by position then id', () => {
    const late = item({ name: 'egg', amount: 2, unit: 'stk', position: 5 })
    const early = item({ name: 'egg', amount: 1, unit: 'stk', position: 1 })
    expect(mergeItems([late, early])[0].items.map((i) => i.id)).toEqual([early.id, late.id])
  })

  it('flags lines that can be undone', () => {
    const plain = mergeItems([item({ name: 'melk', amount: 1, unit: 'l' })])
    expect(plain[0].canUndo).toBe(false)
    const converted = mergeItems([item({ name: 'melk', amount: 10, unit: 'dl', orig_amount: 1, orig_unit: 'l' })])
    expect(converted[0].canUndo).toBe(true)
  })
})

describe('convertAmount', () => {
  it('uses fixed relations without food data', () => {
    expect(convertAmount(2, 'ss', 'ml', {})).toBe(30)
    expect(convertAmount(1, 'kg', 'g', {})).toBe(1000)
  })
  it('needs a measure to cross volume and weight', () => {
    expect(convertAmount(1, 'dl', 'g', {})).toBeNull()
    expect(convertAmount(1, 'dl', 'g', { dl: 55 })).toBe(55)
  })
  it('never guesses between unrelated units', () => {
    expect(convertAmount(1, 'stk', 'dl', {})).toBeNull()
  })
})

describe('suggestMerges', () => {
  it('offers volume and weight units when the food has a measure', () => {
    const lines = mergeItems([
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' }),
    ])
    const [s] = suggestMerges(lines, measures)
    expect(s.name).toBe('mel')
    const g = s.options.find((o) => o.unit === 'g')!
    expect(g.amount).toBeCloseTo(255)
    const dl = s.options.find((o) => o.unit === 'dl')!
    expect(dl.amount).toBeCloseTo(1 + 200 / 55)
    // the lines' own units come first
    expect(s.options.slice(0, 2).map((o) => o.unit).sort()).toEqual(['dl', 'g'])
  })

  it('without a measure only offers units within the same family', () => {
    const lines = mergeItems([
      item({ name: 'fløte', food_id: 99, amount: 3, unit: 'dl' }),
      item({ name: 'fløte', food_id: 99, amount: 2, unit: 'ss' }),
    ])
    const [s] = suggestMerges(lines)
    const units = s.options.map((o) => o.unit)
    expect(units).toContain('dl')
    expect(units).toContain('ml')
    expect(units).not.toContain('g')
    expect(s.options.find((o) => o.unit === 'dl')!.amount).toBeCloseTo(3.3)
  })

  it('makes no suggestion when the lines cannot be converted to a common unit', () => {
    const lines = mergeItems([
      item({ name: 'løk', food_id: 7, amount: 1, unit: 'stk' }),
      item({ name: 'løk', food_id: 7, amount: 2, unit: 'dl' }),
    ])
    expect(suggestMerges(lines)).toEqual([])
  })

  it('makes no suggestion for a single line, or for lines without an amount', () => {
    expect(suggestMerges(mergeItems([item({ name: 'melk', amount: 1, unit: 'l' })]))).toEqual([])
    expect(suggestMerges(mergeItems([item({ name: 'salt' }), item({ name: 'salt', amount: 1, unit: 'ts' })]))).toEqual([])
  })

  it('does not suggest merging different foods', () => {
    const lines = mergeItems([
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'sukker', food_id: 11, amount: 200, unit: 'g' }),
    ])
    expect(suggestMerges(lines, measures)).toEqual([])
  })
})

describe('conversionOptions (manual conversion)', () => {
  it('lists every unit a line converts to exactly, never its own', () => {
    const [line] = mergeItems([item({ name: 'mel', food_id: 10, amount: 2, unit: 'dl' })])
    const opts = conversionOptions(line, measures)
    const units = opts.map((o) => o.unit)
    expect(units).toContain('g')
    expect(units).toContain('ml')
    expect(units).not.toContain('dl')
    expect(opts.find((o) => o.unit === 'g')!.amount).toBeCloseTo(110)
    expect(opts.find((o) => o.unit === 'ml')!.amount).toBe(200)
  })

  it('stays within the same family without a measure', () => {
    const [line] = mergeItems([item({ name: 'fløte', food_id: 99, amount: 2, unit: 'dl' })])
    const units = conversionOptions(line).map((o) => o.unit)
    expect(units).toContain('ss')
    expect(units).not.toContain('g')
  })

  it('offers nothing for lines without an amount or unit', () => {
    const [none] = mergeItems([item({ name: 'salt' })])
    const [noUnit] = mergeItems([item({ name: 'egg', amount: 3 })])
    expect(conversionOptions(none)).toEqual([])
    expect(conversionOptions(noUnit)).toEqual([])
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

  it('after applying, the rows merge into one line automatically', () => {
    const rows = [
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g' }),
    ]
    const [s] = suggestMerges(mergeItems(rows), measures)
    const lines = mergeItems(applyRows(rows, applyMerge(s, 'g', measures)))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ amount: 255, unit: 'g', canUndo: true })
  })

  it('converts a single line by hand', () => {
    const rows = [item({ name: 'mel', food_id: 10, amount: 2, unit: 'dl' })]
    const lines = mergeItems(rows)
    const next = mergeItems(applyRows(rows, convertLines(lines, 'g', measures)))
    expect(next[0]).toMatchObject({ amount: 110, unit: 'g', canUndo: true })
  })

  it('keeps recipe links and converts ranges', () => {
    const a = item({ name: 'fløte', food_id: 99, amount: 1, amount_max: 2, unit: 'dl', recipe_id: 'r1' })
    const b = item({ name: 'fløte', food_id: 99, amount: 2, unit: 'ss', recipe_id: 'r2' })
    const [s] = suggestMerges(mergeItems([a, b]))
    const updates = applyMerge(s, 'ml')
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
  it('restores the originals and clears the bookkeeping', () => {
    const rows = [
      item({ name: 'mel', food_id: 10, amount: 1, unit: 'dl', recipe_title: 'A' }),
      item({ name: 'mel', food_id: 10, amount: 200, unit: 'g', recipe_title: 'B' }),
    ]
    const [s] = suggestMerges(mergeItems(rows), measures)
    const converted = applyRows(rows, applyMerge(s, 'g', measures))
    const restored = applyRows(converted, undoUpdates(mergeItems(converted)))
    expect(restored.map((r) => [r.amount, r.unit, r.orig_unit])).toEqual([
      [1, 'dl', null],
      [200, 'g', null],
    ])
    // back to two separate lines
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

  it('does nothing for lines that were never converted', () => {
    expect(undoUpdates(mergeItems([item({ name: 'melk', amount: 1, unit: 'l' })]))).toEqual([])
  })

  it('restores ranges', () => {
    let rows = [item({ name: 'fløte', food_id: 99, amount: 1, amount_max: 2, unit: 'dl' })]
    rows = applyRows(rows, convertLines(mergeItems(rows), 'ml'))
    rows = applyRows(rows, undoUpdates(mergeItems(rows)))
    expect(rows[0]).toMatchObject({ amount: 1, amount_max: 2, unit: 'dl' })
  })
})

describe('formatting (decimals, no fractions)', () => {
  it('formats g and ml as whole numbers and other units with up to two decimals', () => {
    expect(formatDecimal(255.4, 'g')).toBe('255')
    expect(formatDecimal(99.6, 'ml')).toBe('100')
    expect(formatDecimal(3.3, 'dl')).toBe('3,3')
    expect(formatDecimal(3.25, 'dl')).toBe('3,25')
    expect(formatDecimal(3.254, 'dl')).toBe('3,25')
    expect(formatDecimal(1.5, 'ss')).toBe('1,5')
    expect(formatDecimal(7, 'dl')).toBe('7')
    expect(formatDecimal(2, null)).toBe('2')
  })

  it('never shows a real amount as zero', () => {
    expect(formatDecimal(0.2, 'g')).toBe('1')
    expect(formatDecimal(0.001, 'dl')).toBe('0,01')
  })

  it('formats whole lines', () => {
    expect(formatLineAmount({ amount: 7, amountMax: null, unit: 'dl' })).toBe('7 dl')
    expect(formatLineAmount({ amount: 3.3, amountMax: null, unit: 'dl' })).toBe('3,3 dl')
    expect(formatLineAmount({ amount: 1, amountMax: 2, unit: 'dl' })).toBe('1–2 dl')
    expect(formatLineAmount({ amount: 254.6, amountMax: null, unit: 'g' })).toBe('255 g')
    expect(formatLineAmount({ amount: 2, amountMax: null, unit: null })).toBe('2')
    expect(formatLineAmount({ amount: null, amountMax: null, unit: 'dl' })).toBe('')
  })
})

describe('groupByAisle', () => {
  it('orders aisles for shopping and puts unknown aisles before Annet', () => {
    const groups = groupByAisle([
      { aisle: 'Annet' },
      { aisle: 'Meieri og egg' },
      { aisle: 'Frukt og grønt' },
      { aisle: 'Ukjent' },
    ])
    expect(groups.map((g) => g.aisle)).toEqual(['Frukt og grønt', 'Meieri og egg', 'Ukjent', 'Annet'])
  })
})
