import { describe, expect, it } from 'vitest'
import { overrideFor, overrideKey } from './aisle-overrides'

describe('aisle overrides', () => {
  it('normalises names the same way everywhere, so one correction matches every spelling', () => {
    expect(overrideKey('  Greek   Yoghurt ')).toBe('greek yoghurt')
    expect(overrideKey('SITRONSAFT')).toBe('sitronsaft')
    expect(overrideKey('x'.repeat(150))).toHaveLength(100)
  })

  it('looks a correction up by any spelling of the name, and returns null when there is none', () => {
    const overrides = new Map([['sitronsaft', 'Krydder og saus']])
    expect(overrideFor(overrides, 'Sitronsaft ')).toBe('Krydder og saus')
    expect(overrideFor(overrides, 'sitron')).toBeNull()
    expect(overrideFor(undefined, 'sitronsaft')).toBeNull()
  })
})
