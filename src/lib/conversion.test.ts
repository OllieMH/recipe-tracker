import { describe, expect, it } from 'vitest'
import { alternatives, fromGrams, toGrams, volumeToGrams } from './conversion'

// Hvetemel, siktet: 55 g per dl, 9 g per ss (from the seeded data)
const flour = { dl: 55, ss: 9 }

describe('toGrams', () => {
  it('converts weight units without a food', () => {
    expect(toGrams(2, 'kg', {})).toBe(2000)
    expect(toGrams(150, 'g', {})).toBe(150)
  })
  it('uses an exact measure when present', () => {
    expect(toGrams(2, 'dl', flour)).toBe(110)
    expect(toGrams(3, 'ss', flour)).toBe(27)
  })
  it('derives other volume units via grams per ml', () => {
    expect(toGrams(500, 'ml', flour)).toBeCloseTo(275)
    expect(toGrams(1, 'ts', flour)).toBeCloseTo(2.75)
  })
  it('never guesses without a measure', () => {
    expect(toGrams(2, 'dl', {})).toBeNull()
    expect(toGrams(2, 'stk', flour)).toBeNull()
    expect(toGrams(2, null, flour)).toBeNull()
  })
})

describe('fromGrams / alternatives', () => {
  it('round-trips', () => {
    expect(fromGrams(110, 'dl', flour)).toBe(2)
  })
  it('lists alternatives only for computable units', () => {
    const alts = alternatives(2, 'dl', flour)
    expect(alts.map((a) => a.unit)).toEqual(['g', 'ml', 'ss', 'ts'])
    expect(alts.find((a) => a.unit === 'g')?.amount).toBe(110)
  })
  it('returns nothing without measures', () => {
    expect(alternatives(2, 'dl', {})).toEqual([])
  })
})

describe('volumeToGrams', () => {
  it('only converts volume units', () => {
    expect(volumeToGrams(2, 'dl', flour)).toBe(110)
    expect(volumeToGrams(2, 'stk', { stk: 60, dl: 55 })).toBeNull()
    expect(volumeToGrams(200, 'g', flour)).toBeNull()
  })
})
