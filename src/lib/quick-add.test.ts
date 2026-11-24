import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './quick-add'

describe('parseQuickAdd', () => {
  it('returns null for empty input', () => {
    expect(parseQuickAdd('')).toBeNull()
    expect(parseQuickAdd('   ')).toBeNull()
  })

  it('takes a plain name as is', () => {
    expect(parseQuickAdd('melk')).toEqual({ name: 'melk', amount: null, unit: null })
    expect(parseQuickAdd('  hakket  kjøtt ')).toEqual({ name: 'hakket kjøtt', amount: null, unit: null })
  })

  it('parses amount, unit and name', () => {
    expect(parseQuickAdd('2 dl melk')).toEqual({ name: 'melk', amount: 2, unit: 'dl' })
    expect(parseQuickAdd('500 g hakket kjøtt')).toEqual({ name: 'hakket kjøtt', amount: 500, unit: 'g' })
    expect(parseQuickAdd('1,5 l juice')).toEqual({ name: 'juice', amount: 1.5, unit: 'l' })
    expect(parseQuickAdd('0.5 kg smør')).toEqual({ name: 'smør', amount: 0.5, unit: 'kg' })
  })

  it('accepts a unit glued to the number', () => {
    expect(parseQuickAdd('500g mel')).toEqual({ name: 'mel', amount: 500, unit: 'g' })
  })

  it('parses an amount without a unit', () => {
    expect(parseQuickAdd('2 egg')).toEqual({ name: 'egg', amount: 2, unit: null })
  })

  it('does not mistake the start of a word for a unit', () => {
    expect(parseQuickAdd('2 løk')).toEqual({ name: 'løk', amount: 2, unit: null })
    expect(parseQuickAdd('3 gulrøtter')).toEqual({ name: 'gulrøtter', amount: 3, unit: null })
    expect(parseQuickAdd('1 sitron')).toEqual({ name: 'sitron', amount: 1, unit: null })
    expect(parseQuickAdd('2 stkkaker')).toEqual({ name: 'stkkaker', amount: 2, unit: null })
  })

  it('maps unit words to canonical units', () => {
    expect(parseQuickAdd('2 liter melk')).toEqual({ name: 'melk', amount: 2, unit: 'l' })
    expect(parseQuickAdd('3 spiseskje sukker')).toEqual({ name: 'sukker', amount: 3, unit: 'ss' })
    expect(parseQuickAdd('2 STK egg')).toEqual({ name: 'egg', amount: 2, unit: 'stk' })
  })

  it('treats a bare number or zero as a name', () => {
    expect(parseQuickAdd('7')).toEqual({ name: '7', amount: null, unit: null })
    expect(parseQuickAdd('0 melk')).toEqual({ name: '0 melk', amount: null, unit: null })
  })

  it('keeps names that merely start with a digit', () => {
    expect(parseQuickAdd('7up')).toEqual({ name: '7up', amount: null, unit: null })
    expect(parseQuickAdd('500g')).toEqual({ name: '500g', amount: null, unit: null })
  })
})
