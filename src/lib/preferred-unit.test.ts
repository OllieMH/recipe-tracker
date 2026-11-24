import { describe, expect, it } from 'vitest'
import { preferredKind, toPreferredUnit } from './preferred-unit'

const d = (amount: number | null, unit: string | null, amountMax: number | null = null) => ({ amount, amountMax, unit })

describe('toPreferredUnit', () => {
  it('buys liquids by volume and dry goods by weight, rounded to shopping amounts', () => {
    const milk = { dl: 103 } // 1 dl milk is about 103 g
    const flour = { dl: 55 }
    expect(toPreferredUnit(d(600, 'g'), 'volume', milk)).toEqual(d(6, 'dl')) // 5,8 dl -> 6 dl
    expect(toPreferredUnit(d(4, 'dl'), 'weight', flour)).toEqual(d(220, 'g'))
    expect(toPreferredUnit(d(20, 'dl'), 'weight', flour)).toEqual(d(1.1, 'kg'))
  })

  it('tidies units within the same family without rounding', () => {
    expect(toPreferredUnit(d(1500, 'g'), 'weight', undefined)).toEqual(d(1.5, 'kg'))
    expect(toPreferredUnit(d(12, 'dl'), 'volume', undefined)).toEqual(d(1.2, 'l'))
    expect(toPreferredUnit(d(250, 'ml'), 'volume', undefined)).toEqual(d(2.5, 'dl'))
    expect(toPreferredUnit(d(0.5, 'kg'), 'weight', undefined)).toEqual(d(500, 'g'))
  })

  it('leaves cooking measures, counts, small ml and unknown densities alone', () => {
    expect(toPreferredUnit(d(2, 'ss'), 'weight', { dl: 55 })).toEqual(d(2, 'ss'))
    expect(toPreferredUnit(d(3, 'stk'), 'volume', { dl: 100 })).toEqual(d(3, 'stk'))
    expect(toPreferredUnit(d(50, 'ml'), 'volume', undefined)).toEqual(d(50, 'ml'))
    expect(toPreferredUnit(d(600, 'g'), 'volume', undefined)).toEqual(d(600, 'g')) // no measure: never guess
    expect(toPreferredUnit(d(null, null), 'weight', undefined)).toEqual(d(null, null))
  })

  it('converts ranges too', () => {
    expect(toPreferredUnit(d(2, 'dl', 4), 'weight', { dl: 55 })).toEqual(d(110, 'g', 220))
  })
})

describe('preferredKind', () => {
  it('is volume for drinks and liquids, weight otherwise', () => {
    expect(['Melk', 'Matolje', 'Fløte og rømme'].map(preferredKind)).toEqual(['volume', 'volume', 'volume'])
    expect([null, 'Mel', 'Margarin og smør', 'Egg'].map(preferredKind)).toEqual(['weight', 'weight', 'weight', 'weight'])
  })
})
