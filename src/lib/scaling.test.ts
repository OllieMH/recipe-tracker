import { describe, expect, it } from 'vitest'
import { formatNumber, formatRange, roundForUnit, scaleAmount, scaleFactor } from './scaling'

describe('roundForUnit', () => {
  it('rounds g/ml to whole numbers, nearest 5 from 100', () => {
    expect(roundForUnit(87.3, 'g')).toBe(87)
    expect(roundForUnit(342, 'g')).toBe(340)
    expect(roundForUnit(347, 'ml')).toBe(345)
    expect(roundForUnit(0.2, 'g')).toBe(1)
  })
  it('rounds dl to nearest 0.25', () => {
    expect(roundForUnit(2.37, 'dl')).toBe(2.25)
    expect(roundForUnit(2.4, 'dl')).toBe(2.5)
    expect(roundForUnit(0.05, 'dl')).toBe(0.25)
  })
  it('rounds spoons and pieces to nearest 0.5, never below 0.5', () => {
    expect(roundForUnit(0.2, 'ss')).toBe(0.5)
    expect(roundForUnit(1.3, 'stk')).toBe(1.5)
    expect(roundForUnit(1.2, 'ts')).toBe(1)
    expect(roundForUnit(0.1, 'fedd')).toBe(0.5)
  })
})

describe('formatNumber', () => {
  it('uses fractions and decimal comma', () => {
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(0.5)).toBe('½')
    expect(formatNumber(1.5)).toBe('1 ½')
    expect(formatNumber(2.25)).toBe('2 ¼')
    expect(formatNumber(0.75)).toBe('¾')
    expect(formatNumber(2.333)).toBe('2,33')
  })
})

describe('scaling', () => {
  it('computes the factor, falling back to 1 without servings', () => {
    expect(scaleFactor(8, 4)).toBe(2)
    expect(scaleFactor(8, null)).toBe(1)
    expect(scaleFactor(0, 4)).toBe(1)
  })
  it('scales amounts and leaves non-scalable ones alone', () => {
    expect(scaleAmount(2, 'dl', 1.5, true)).toBe(3)
    expect(scaleAmount(1, 'ts', 2, false)).toBe(1)
    expect(scaleAmount(null, 'g', 2, true)).toBeNull()
  })
  it('does not round when the factor is 1', () => {
    expect(scaleAmount(2.37, 'dl', 1, true)).toBe(2.37)
  })
  it('formats ranges', () => {
    expect(formatRange(2, 3)).toBe('2–3')
    expect(formatRange(2, null)).toBe('2')
    expect(formatRange(null, null)).toBe('')
  })
})
