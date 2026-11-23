// Plain-text version of a recipe, for pasting into messages and emails.

import { displayIngredient, ingredientText } from './ingredient-display'
import { formatNumber, scaleFactor } from './scaling'
import type { ExportableRecipe, ExportOptions } from './markdown'

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`
}

export function recipeToPlainText(r: ExportableRecipe, opts: ExportOptions = {}): string {
  const shown = opts.servings ?? r.servings
  const factor = scaleFactor(shown ?? 0, r.servings)

  const meta = [
    shown != null ? `${formatNumber(shown)} ${r.servings_unit ?? 'porsjoner'}` : null,
    r.total_minutes ? `Totalt ${formatMinutes(r.total_minutes)}` : null,
  ].filter(Boolean).join(' · ')

  const out: string[] = [r.title.trim() || 'Oppskrift uten navn']
  if (meta) out.push(meta)
  if (r.description?.trim()) out.push('', r.description.trim())

  out.push('', 'INGREDIENSER')
  for (const g of r.ingredient_groups) {
    if (g.name?.trim()) out.push('', `${g.name.trim()}:`)
    for (const ing of g.ingredients) {
      const d = displayIngredient(ing, factor, !!opts.grams, ing.food_id != null ? opts.measures?.get(ing.food_id) : undefined)
      out.push(`- ${ingredientText(d, ing.name, ing.note)}`)
    }
  }

  out.push('', 'FREMGANGSMÅTE')
  let n = 0
  let lastGroup: string | null = null
  for (const s of r.steps) {
    const group = s.group_name?.trim() || null
    if (group !== lastGroup) {
      if (group) out.push('', `${group}:`)
      n = 0
      lastGroup = group
    }
    out.push(`${++n}. ${s.text.trim()}`)
  }

  const tips = r.tips.map((t) => t.trim()).filter(Boolean)
  if (tips.length) out.push('', 'TIPS', ...tips.map((t) => `- ${t}`))
  if (r.source_url) out.push('', `Kilde: ${r.source_url}`)

  return out.join('\n') + '\n'
}
