import { describe, expect, it } from 'vitest'
import { applyChanges, computeChanges } from './recipe-diff'
import type { DraftIngredient, DraftRecipe } from './recipe-draft'

const ing = (name: string, amount: string, unit = 'dl', food_id: number | null = null): DraftIngredient => ({
  key: name, original_text: `${amount} ${unit} ${name}`, amount, amount_max: '', unit,
  original_amount: null, original_unit: null, name, note: '', scalable: true, food_id,
})

const base = (): DraftRecipe => ({
  visibility: 'public', title: 'Pannekaker', description: '', servings: '4', servings_unit: 'porsjoner',
  prep_minutes: '', total_minutes: '', source_url: '', original_language: 'no', was_translated: false,
  tags: 'frokost', tips: '',
  groups: [{ key: 'g', name: '', ingredients: [ing('mel', '2', 'dl', 10), ing('melk', '5')] }],
  steps: [
    { key: 's1', group_name: '', text: 'Bland mel og melk.' },
    { key: 's2', group_name: '', text: 'Stek.' },
  ],
  oven: [],
  import_raw_text: null, corrections: [], warnings: [],
})

describe('computeChanges', () => {
  it('finds nothing when identical', () => {
    expect(computeChanges(base(), base())).toEqual([])
  })

  it('splits scalar, ingredient and step changes into separate items', () => {
    const p = base()
    p.servings = '6'
    p.groups[0].ingredients[1] = ing('melk', '7.5')
    p.steps[1].text = 'Stek i smør.'
    const ids = computeChanges(base(), p).map((c) => c.id)
    expect(ids).toEqual(['servings', 'ing-0-1', 'step-1'])
  })

  it('applies only the accepted changes', () => {
    const p = base()
    p.servings = '6'
    p.steps[1].text = 'Stek i smør.'
    const changes = computeChanges(base(), p)
    const out = applyChanges(base(), changes.filter((c) => c.id === 'step-1'))
    expect(out.steps[1].text).toBe('Stek i smør.')
    expect(out.servings).toBe('4')
  })

  it('keeps the food link and original text when only the amount changes', () => {
    const p = base()
    p.groups[0].ingredients[0] = ing('mel', '3', 'dl', null)
    const out = applyChanges(base(), computeChanges(base(), p))
    expect(out.groups[0].ingredients[0].amount).toBe('3')
    expect(out.groups[0].ingredients[0].food_id).toBe(10)
    expect(out.groups[0].ingredients[0].original_text).toBe('2 dl mel')
  })

  it('replaces the whole list when the structure changes, keeping links by name', () => {
    const p = base()
    p.groups[0].ingredients.push(ing('salt', '1', 'ts'))
    p.groups[0].ingredients[0] = ing('mel', '2', 'dl', null)
    const changes = computeChanges(base(), p)
    expect(changes.map((c) => c.id)).toEqual(['ingredients'])
    const out = applyChanges(base(), changes)
    expect(out.groups[0].ingredients).toHaveLength(3)
    expect(out.groups[0].ingredients[0].food_id).toBe(10)
  })

  it('replaces all steps when the count changes', () => {
    const p = base()
    p.steps.push({ key: 's3', group_name: '', text: 'Server.' })
    const changes = computeChanges(base(), p)
    expect(changes.map((c) => c.id)).toEqual(['steps'])
    expect(applyChanges(base(), changes).steps).toHaveLength(3)
  })

  it('offers filled-in oven settings as one change', () => {
    const p = base()
    p.oven = [{ key: 'o', temp_c: '200', mode: 'varmluft', minutes: '25', minutes_max: '30', rack: 'midten', note: '' }]
    const changes = computeChanges(base(), p)
    expect(changes.map((c) => c.id)).toEqual(['oven'])
    expect(changes[0].after).toBe('200 °C, varmluft, 25–30 min, midt i ovnen')
    expect(applyChanges(base(), changes).oven).toHaveLength(1)
  })
})
