import { describe, expect, it } from 'vitest'
import { otherModeHint, ovenStepText, parseOven } from './oven'
import { ovenFromDraft, type DraftOven } from './recipe-draft'
import { recipeToMarkdown } from './markdown'

const step = { temp_c: 200, mode: 'varmluft', minutes: 25, minutes_max: 30, rack: 'midten', note: null } as const

describe('oven', () => {
  it('writes a setting as one readable line', () => {
    expect(ovenStepText(step)).toBe('200 °C, varmluft, 25–30 min, midt i ovnen')
    expect(ovenStepText({ ...step, mode: null, minutes_max: null, rack: null, note: 'forvarm' })).toBe('200 °C, 25 min, forvarm')
  })

  it('gives the matching heat for the other common mode', () => {
    expect(otherModeHint(step)).toBe('Uten varmluft: ca. 220 °C over- og undervarme')
    expect(otherModeHint({ ...step, mode: 'over_under' })).toBe('Med varmluft: ca. 180 °C')
    expect(otherModeHint({ ...step, mode: 'grill' })).toBeNull()
  })

  it('ignores stored values that do not fit', () => {
    expect(parseOven(null)).toEqual([])
    expect(parseOven([{ temp_c: 'hot' }])).toEqual([])
    expect(parseOven([step])).toEqual([step])
  })

  it('drops empty form rows and rounds numbers', () => {
    const rows: DraftOven[] = [
      { key: 'a', temp_c: '', mode: null, minutes: '', minutes_max: '', rack: null, note: ' ' },
      { key: 'b', temp_c: '187,5', mode: 'over_under', minutes: '40', minutes_max: '', rack: null, note: '' },
    ]
    expect(ovenFromDraft(rows)).toEqual([
      { temp_c: 188, mode: 'over_under', minutes: 40, minutes_max: null, rack: null, note: null },
    ])
  })

  it('adds an Ovn section to the Markdown export', () => {
    const md = recipeToMarkdown({
      title: 'Brød', description: null, servings: null, servings_unit: null, total_minutes: null,
      source_url: null, tags: [], tips: [], ingredient_groups: [], steps: [{ group_name: null, text: 'Stek.' }],
      oven: [step],
    }, { today: new Date('2026-11-27') })
    expect(md).toContain('## Ovn\n\n- 200 °C, varmluft, 25–30 min, midt i ovnen\n\n## Fremgangsmåte')
  })
})
