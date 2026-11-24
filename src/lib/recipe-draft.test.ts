import { describe, expect, it } from 'vitest'
import { draftToPayload, emptyDraft, validateDraft, type DraftRecipe } from './recipe-draft'

/** A manual recipe someone has filled in. */
function filled(): DraftRecipe {
  const d = emptyDraft('private')
  d.title = '  Pannekaker  '
  d.servings = '4'
  d.source_url = 'https://www.example.com/pannekaker'
  d.tags = 'Frokost, Søt ,'
  d.groups[0].ingredients[0] = { ...d.groups[0].ingredients[0], name: 'hvetemel', amount: '3,5', unit: 'dl' }
  d.steps[0].text = 'Visp alt sammen.'
  return d
}

describe('writing a recipe by hand', () => {
  it('starts blank, with room for one ingredient and one step', () => {
    const d = emptyDraft()
    expect(d).toMatchObject({ visibility: 'public', title: '', import_raw_text: null, corrections: [], warnings: [], was_translated: false })
    expect(d.groups).toHaveLength(1)
    expect(d.groups[0].ingredients).toHaveLength(1)
    expect(d.steps).toHaveLength(1)
  })

  it('asks for the title first, then an ingredient, then a step', () => {
    const d = emptyDraft()
    expect(validateDraft(d)).toMatch(/tittel/i)
    d.title = 'Test'
    expect(validateDraft(d)).toMatch(/ingrediens/i)
    d.groups[0].ingredients[0].name = 'mel'
    expect(validateDraft(d)).toMatch(/steg/i)
    d.steps[0].text = 'Bland.'
    expect(validateDraft(d)).toBeNull()
  })

  it('saves a manual recipe with no import traces', () => {
    expect(validateDraft(filled())).toBeNull()
    const p = draftToPayload(filled()) as Record<string, unknown> & { ingredient_groups: { ingredients: Record<string, unknown>[] }[] }
    expect(p).toMatchObject({ title: 'Pannekaker', visibility: 'private', servings: 4, original_language: null, import_raw_text: null, source_site: 'example.com' })
    expect(p.tags).toEqual(['frokost', 'søt'])
    // a typed ingredient has no original line: it falls back to its name
    expect(p.ingredient_groups[0].ingredients[0]).toMatchObject({ name: 'hvetemel', amount: 3.5, unit: 'dl', original_text: 'hvetemel' })
  })
})
