import { describe, expect, it } from 'vitest'
import { aisleFromFood, aisleFromName, AISLES, chooseAisle, effectiveOrder, rememberMove } from './aisles'

describe('aisleFromName', () => {
  it.each([
    // from real lists that used to land in odd places
    ['ketchup', 'Krydder, olje og saus'],
    ['hermetiske tomater', 'Middag og hermetikk'],
    ['tomatpuré', 'Middag og hermetikk'],
    ['kjøttkraft, buljong eller vann', 'Middag og hermetikk'],
    ['lasagneplater', 'Middag og hermetikk'],
    ['koriander', 'Frukt og grønt'],
    ['ingefær', 'Frukt og grønt'],
    ['sitronsaft', 'Frukt og grønt'],
    ['tørket oregano', 'Krydder, olje og saus'],
    ['malt ingefær', 'Krydder, olje og saus'],
    ['korianderfrø', 'Krydder, olje og saus'],
    ['honning', 'Pålegg og frokost'],
    ['hvetemel', 'Bakevarer'],
    ['mel', 'Bakevarer'],
    ['sukker', 'Bakevarer'],
    ['brunt sukker', 'Bakevarer'],
    ['lys kokesjokolade', 'Bakevarer'],
    ['nøytral olje', 'Krydder, olje og saus'],
    ['olivenolje', 'Krydder, olje og saus'],
    ['bakepapir', 'Husholdning'],
    ['badeolje', 'Husholdning'],
    ['julebrus', 'Drikke'],
    ['glutenfri lys melmiks til gjærbakst', 'Fri for'],
    ['laktosefri melk', 'Fri for'],
    ['tacokrydder', 'Middag og hermetikk'],
    ['gjær', 'Meieri og egg'],
    ['tørrgjær', 'Bakevarer'],
    ['bacon eller pancetta', 'Kjøtt og fisk'],
    ['grønn chili', 'Frukt og grønt'],
    ['chilipulver', 'Krydder, olje og saus'],
    ['fiberhusk', 'Bakevarer'],
  ])('%s -> %s', (name, aisle) => {
    expect(aisleFromName(name)).toBe(aisle)
  })

  it('does not match inside other words', () => {
    expect(aisleFromName('melk')).toBeNull()
    expect(aisleFromName('sukkererter')).toBeNull()
    expect(aisleFromName('pepperoni')).toBeNull()
    expect(aisleFromName('teposer')).toBeNull()
    expect(aisleFromName('kyllingfilet')).toBeNull()
  })

  it('leaves plain chocolate to the food or Gemini', () => {
    expect(aisleFromName('mørk sjokolade')).toBeNull()
  })
})

describe('aisleFromFood', () => {
  const groups = new Map([['Urter og krydder', 'Krydder, olje og saus'], ['Deiger og farser', 'Kjøtt og fisk'], ['Grønnsaksprodukter', 'Middag og hermetikk']])

  it('uses hints in the food name before the food group', () => {
    expect(aisleFromFood({ name_no: 'Dill, rå', category: 'Urter og krydder' }, groups)).toBe('Frukt og grønt')
    expect(aisleFromFood({ name_no: 'Dill, tørket', category: 'Urter og krydder' }, groups)).toBe('Krydder, olje og saus')
    expect(aisleFromFood({ name_no: 'Grønnsaksblanding, blomkål, brokkoli, fryst', category: 'Grønnsaksprodukter' }, groups)).toBe('Frysevarer')
  })

  it('falls back to the food group, and to null for unknown groups', () => {
    expect(aisleFromFood({ name_no: 'Kjøttdeig, storfe, 14 % fett, rå', category: 'Deiger og farser' }, groups)).toBe('Kjøtt og fisk')
    expect(aisleFromFood({ name_no: 'Noe', category: 'Ukjent' }, groups)).toBeNull()
    expect(aisleFromFood(null, groups)).toBeNull()
  })
})

describe('chooseAisle', () => {
  const groups = new Map([['Mel', 'Bakevarer'], ['Gryn, ris og pasta', 'Middag og hermetikk']])
  const food = { name_no: 'Hvetemel, siktet', category: 'Mel' }

  it('goes: list choice, shared move, word rule, Gemini, food, Annet', () => {
    const base = { name: 'mel', food, groupMap: groups }
    expect(chooseAisle({ ...base, list: new Map([['mel', 'Fri for']]), shared: new Map([['mel', 'Annet']]) })).toBe('Fri for')
    expect(chooseAisle({ ...base, shared: new Map([['mel', 'Middag og hermetikk']]) })).toBe('Middag og hermetikk')
    expect(chooseAisle({ ...base, suggested: 'Frysevarer' })).toBe('Bakevarer') // the word rule beats Gemini
    expect(chooseAisle({ name: 'spesialgryn', suggested: 'Pålegg og frokost', food, groupMap: groups })).toBe('Pålegg og frokost')
    expect(chooseAisle({ name: 'spesialgryn', food, groupMap: groups })).toBe('Bakevarer')
    expect(chooseAisle({ name: 'noe rart' })).toBe('Annet')
  })

  it('ignores stored sections that no longer exist', () => {
    expect(chooseAisle({ name: 'kokesjokolade', shared: new Map([['kokesjokolade', 'Brød og bakevarer']]) })).toBe('Bakevarer')
  })
})

describe('rememberMove', () => {
  it('keeps moves into and out of Fri for on the list', () => {
    expect(rememberMove('Bakevarer', 'Fri for', 'Bakevarer')).toEqual({ scope: 'list', aisle: 'Fri for' })
    expect(rememberMove('Fri for', 'Bakevarer', 'Bakevarer')).toEqual({ scope: 'list-clear' })
    expect(rememberMove('Fri for', 'Bakevarer', 'Fri for')).toEqual({ scope: 'list', aisle: 'Bakevarer' })
  })

  it('shares other moves with everyone', () => {
    expect(rememberMove('Annet', 'Drikke', 'Annet')).toEqual({ scope: 'shared', aisle: 'Drikke' })
  })
})

describe('effectiveOrder', () => {
  it('is the default order without a list order', () => {
    expect(effectiveOrder(null)).toEqual([...AISLES])
  })

  it('keeps the list order and fills in missing and new sections', () => {
    const own = ['Kjøtt og fisk', 'Frukt og grønt', 'Ukjent', 'Kjøtt og fisk']
    const out = effectiveOrder(own)
    // own order kept; a missing section goes right after the one before it by default
    expect(out.slice(0, 2)).toEqual(['Kjøtt og fisk', 'Meieri og egg'])
    expect(out.indexOf('Brød')).toBe(out.indexOf('Frukt og grønt') + 1)
    expect(out.indexOf('Frukt og grønt')).toBeGreaterThan(out.indexOf('Kjøtt og fisk'))
    expect(out).toHaveLength(AISLES.length)
    expect(new Set(out).size).toBe(AISLES.length)
  })
})
