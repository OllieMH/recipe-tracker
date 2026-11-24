import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quick-add'

describe('parseQuickAdd', () => {
  it('returns null for empty input and takes a plain name as is', () => {
    expect(parseQuickAdd('   ')).toBeNull()
    expect(parseQuickAdd('  hakket  kjøtt ')).toEqual({ name: 'hakket kjøtt', amount: null, unit: null })
  })

  it('parses amount, unit and name', () => {
    const cases: [string, { name: string; amount: number; unit: string | null }][] = [
      ['2 dl melk', { name: 'melk', amount: 2, unit: 'dl' }],
      ['1,5 l juice', { name: 'juice', amount: 1.5, unit: 'l' }],
      ['500g mel', { name: 'mel', amount: 500, unit: 'g' }], // unit glued to the number
      ['2 egg', { name: 'egg', amount: 2, unit: null }], // amount without a unit
      ['2 liter melk', { name: 'melk', amount: 2, unit: 'l' }], // unit words map to canonical units
      ['3 spiseskje sukker', { name: 'sukker', amount: 3, unit: 'ss' }],
      ['2 STK egg', { name: 'egg', amount: 2, unit: 'stk' }],
    ]
    for (const [input, expected] of cases) expect(parseQuickAdd(input)).toEqual(expected)
  })

  it('does not mistake the start of a word for a unit, or a leading digit for an amount', () => {
    expect(parseQuickAdd('2 løk')).toEqual({ name: 'løk', amount: 2, unit: null })
    expect(parseQuickAdd('3 gulrøtter')).toEqual({ name: 'gulrøtter', amount: 3, unit: null })
    for (const name of ['7up', '500g', '7', '0 melk']) {
      expect(parseQuickAdd(name)).toEqual({ name, amount: null, unit: null })
    }
  })
})
