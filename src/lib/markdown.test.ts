import { describe, expect, it } from 'vitest'
import { exportFilename, recipeToMarkdown, uniqueFilenames, type ExportableRecipe } from './markdown'

const recipe = (): ExportableRecipe => ({
  title: 'Kyllinggryte med kokosmelk',
  description: 'En enkel gryte.',
  servings: 4,
  servings_unit: 'porsjoner',
  total_minutes: 40,
  source_url: 'https://www.matprat.no/oppskrifter/gryte',
  tags: ['middag', 'kylling'],
  tips: ['Server med ris.'],
  ingredient_groups: [
    {
      name: null,
      ingredients: [
        { amount: 600, amount_max: null, unit: 'g', name: 'kyllingfilet', note: null, scalable: true, food_id: null },
        { amount: 2, amount_max: 3, unit: 'ss', name: 'olje', note: 'til steking', scalable: true, food_id: null },
        { amount: 1, amount_max: null, unit: 'ts', name: 'salt', note: null, scalable: false, food_id: null },
      ],
    },
    {
      name: 'Til servering',
      ingredients: [
        { amount: 4, amount_max: null, unit: 'dl', name: 'ris', note: null, scalable: true, food_id: 7 },
      ],
    },
  ],
  steps: [
    { group_name: null, text: 'Stek kyllingen.' },
    { group_name: null, text: 'Tilsett kokosmelk.' },
    { group_name: 'Servering', text: 'Kok risen.' },
  ],
})

const today = new Date('2026-11-23T12:00:00Z')

describe('recipeToMarkdown', () => {
  it('matches the Obsidian format', () => {
    const md = recipeToMarkdown(recipe(), { today })
    expect(md).toBe(`---
title: Kyllinggryte med kokosmelk
source: https://www.matprat.no/oppskrifter/gryte
servings: 4
time: 40 min
tags: [oppskrift, middag, kylling]
created: 2026-11-23
---

# Kyllinggryte med kokosmelk

En enkel gryte.

Kilde: [matprat.no](https://www.matprat.no/oppskrifter/gryte)

## Ingredienser

- [ ] 600 g kyllingfilet
- [ ] 2–3 ss olje, til steking
- [ ] 1 ts salt

### Til servering
- [ ] 4 dl ris

## Fremgangsmåte

1. Stek kyllingen.
2. Tilsett kokosmelk.

### Servering
1. Kok risen.

## Tips

- Server med ris.
`)
  })

  it('exports the shown servings and notes scaled_from', () => {
    const md = recipeToMarkdown(recipe(), { servings: 8, today })
    expect(md).toContain('servings: 8')
    expect(md).toContain('scaled_from: 4')
    expect(md).toContain('- [ ] 1200 g kyllingfilet')
    expect(md).toContain('- [ ] 1 ts salt') // not scalable
  })

  it('has no scaled_from when servings are unchanged', () => {
    expect(recipeToMarkdown(recipe(), { servings: 4, today })).not.toContain('scaled_from')
  })

  it('converts volume to grams when asked and a measure exists', () => {
    const measures = new Map([[7, { dl: 85 }]])
    const md = recipeToMarkdown(recipe(), { grams: true, measures, today })
    expect(md).toContain('- [ ] 340 g ris')
    expect(md).toContain('- [ ] 2–3 ss olje') // no food link: left alone
  })

  it('quotes YAML values that need it', () => {
    const r = recipe()
    r.title = 'Kake: den beste'
    expect(recipeToMarkdown(r, { today })).toContain('title: "Kake: den beste"')
  })

  it('survives a recipe without servings', () => {
    const r = recipe()
    r.servings = null
    const md = recipeToMarkdown(r, { today })
    expect(md).not.toContain('servings:')
    expect(md).toContain('- [ ] 600 g kyllingfilet')
  })
})

describe('filenames', () => {
  it('removes characters Obsidian disallows', () => {
    expect(exportFilename('Pai: "Eple" / kanel #1 [ny]?')).toBe('Pai Eple kanel 1 ny.md')
    expect(exportFilename('???')).toBe('Oppskrift.md')
  })
  it('makes names unique in a zip', () => {
    expect(uniqueFilenames(['Pasta.md', 'pasta.md', 'Suppe.md', 'Pasta.md'])).toEqual([
      'Pasta.md', 'pasta (2).md', 'Suppe.md', 'Pasta (3).md',
    ])
  })
})
