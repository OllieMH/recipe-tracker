// Field-by-field diff between the current recipe and an AI-proposed one.
// Each Change can be accepted or rejected on its own ("Fiks med AI").

import { newKey, type DraftGroup, type DraftIngredient, type DraftRecipe } from './recipe-draft'

export interface Change {
  id: string
  label: string
  before: string
  after: string
  apply: (d: DraftRecipe) => DraftRecipe
}

export const ingredientLine = (i: DraftIngredient): string => {
  const amount = i.amount_max.trim() ? `${i.amount}–${i.amount_max}` : i.amount
  return [`${amount} ${i.unit}`.trim(), i.name.trim()].filter(Boolean).join(' ') + (i.note.trim() ? `, ${i.note.trim()}` : '')
}

const signature = (i: DraftIngredient) =>
  [i.amount.trim(), i.amount_max.trim(), i.unit, i.name.trim(), i.note.trim(), i.scalable].join('|')

const SCALARS: { key: 'title' | 'description' | 'servings' | 'servings_unit' | 'prep_minutes' | 'total_minutes' | 'tags'; label: string }[] = [
  { key: 'title', label: 'Tittel' },
  { key: 'description', label: 'Beskrivelse' },
  { key: 'servings', label: 'Porsjoner' },
  { key: 'servings_unit', label: 'Porsjonsenhet' },
  { key: 'prep_minutes', label: 'Forberedelse (min)' },
  { key: 'total_minutes', label: 'Total tid (min)' },
  { key: 'tags', label: 'Emneord' },
]

const norm = (s: string) => s.trim().toLowerCase()

/** Re-uses existing food links when the ingredient name is unchanged. */
function keepFoodLinks(proposed: DraftGroup[], current: DraftGroup[]): DraftGroup[] {
  const byName = new Map<string, number | null>()
  for (const g of current) for (const i of g.ingredients) byName.set(norm(i.name), i.food_id)
  return proposed.map((g) => ({
    ...g,
    ingredients: g.ingredients.map((i) => ({
      ...i,
      food_id: byName.has(norm(i.name)) ? (byName.get(norm(i.name)) ?? i.food_id) : i.food_id,
    })),
  }))
}

export function computeChanges(current: DraftRecipe, proposed: DraftRecipe): Change[] {
  const changes: Change[] = []

  for (const { key, label } of SCALARS) {
    if (current[key].trim() !== proposed[key].trim()) {
      changes.push({
        id: key, label, before: current[key], after: proposed[key],
        apply: (d) => ({ ...d, [key]: proposed[key] }),
      })
    }
  }

  // Ingredients: per ingredient when the structure is unchanged, otherwise the whole list.
  const sameShape =
    current.groups.length === proposed.groups.length &&
    current.groups.every((g, gi) => g.ingredients.length === proposed.groups[gi].ingredients.length)

  if (sameShape) {
    current.groups.forEach((g, gi) => {
      const pg = proposed.groups[gi]
      if (g.name.trim() !== pg.name.trim()) {
        changes.push({
          id: `group-${gi}`, label: 'Gruppenavn', before: g.name || '(ingen)', after: pg.name || '(ingen)',
          apply: (d) => ({ ...d, groups: d.groups.map((x, i) => (i === gi ? { ...x, name: pg.name } : x)) }),
        })
      }
      g.ingredients.forEach((ing, ii) => {
        const pi = pg.ingredients[ii]
        if (signature(ing) === signature(pi)) return
        changes.push({
          id: `ing-${gi}-${ii}`,
          label: `Ingrediens: ${ing.name}`,
          before: ingredientLine(ing),
          after: ingredientLine(pi),
          apply: (d) => ({
            ...d,
            groups: d.groups.map((x, i) =>
              i !== gi ? x : {
                ...x,
                ingredients: x.ingredients.map((old, j) =>
                  j !== ii ? old : {
                    ...pi,
                    key: old.key,
                    original_text: old.original_text,
                    original_amount: old.original_amount,
                    original_unit: old.original_unit,
                    food_id: norm(pi.name) === norm(old.name) ? old.food_id : pi.food_id,
                  },
                ),
              },
            ),
          }),
        })
      })
    })
  } else {
    const lines = (gs: DraftGroup[]) =>
      gs.map((g) => (g.name ? `${g.name}:\n` : '') + g.ingredients.map(ingredientLine).join('\n')).join('\n')
    const before = lines(current.groups)
    const after = lines(proposed.groups)
    if (before !== after) {
      changes.push({
        id: 'ingredients', label: 'Ingredienser (hele listen)', before, after,
        apply: (d) => ({
          ...d,
          groups: keepFoodLinks(proposed.groups, d.groups).map((g) => ({
            ...g, key: newKey(), ingredients: g.ingredients.map((i) => ({ ...i, key: newKey() })),
          })),
        }),
      })
    }
  }

  // Steps: per step when the count is unchanged, otherwise the whole list.
  if (current.steps.length === proposed.steps.length) {
    current.steps.forEach((s, si) => {
      const p = proposed.steps[si]
      if (s.text.trim() === p.text.trim() && s.group_name.trim() === p.group_name.trim()) return
      changes.push({
        id: `step-${si}`, label: `Steg ${si + 1}`, before: s.text, after: p.text,
        apply: (d) => ({ ...d, steps: d.steps.map((x, i) => (i === si ? { ...x, text: p.text, group_name: p.group_name } : x)) }),
      })
    })
  } else {
    const fmt = (st: DraftRecipe['steps']) => st.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
    changes.push({
      id: 'steps', label: 'Fremgangsmåte (alle steg)', before: fmt(current.steps), after: fmt(proposed.steps),
      apply: (d) => ({ ...d, steps: proposed.steps.map((s) => ({ ...s, key: newKey() })) }),
    })
  }

  if (current.tips.trim() !== proposed.tips.trim()) {
    changes.push({
      id: 'tips', label: 'Tips', before: current.tips, after: proposed.tips,
      apply: (d) => ({ ...d, tips: proposed.tips }),
    })
  }

  return changes
}

export function applyChanges(current: DraftRecipe, changes: Change[]): DraftRecipe {
  return changes.reduce((d, c) => c.apply(d), current)
}
