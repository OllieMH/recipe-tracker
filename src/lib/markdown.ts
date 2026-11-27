// Markdown export in the same format as the "Oppskrift til Obsidian" tool.

import type { Measures } from './conversion'
import { displayIngredient, ingredientText, type DisplayableIngredient } from './ingredient-display'
import { formatNumber, scaleFactor } from './scaling'
import { ovenStepText, type OvenStep } from './oven'

export interface ExportableRecipe {
  title: string
  description: string | null
  servings: number | null
  servings_unit: string | null
  total_minutes: number | null
  source_url: string | null
  tags: string[]
  tips: string[]
  ingredient_groups: {
    name: string | null
    ingredients: (DisplayableIngredient & { name: string; note: string | null; food_id: number | null })[]
  }[]
  steps: { group_name: string | null; text: string }[]
  oven?: OvenStep[]
}

export interface ExportOptions {
  /** Servings currently shown. Defaults to the recipe's own. */
  servings?: number | null
  /** "Vis i gram" mode. */
  grams?: boolean
  /** food_id -> measures, needed for gram conversion. */
  measures?: Map<number, Measures>
  /** Date written to `created`. Defaults to today. */
  today?: Date
}

/** Quotes a YAML value only when needed. */
const yq = (s: string) => (/[:#[\]{},&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) ? JSON.stringify(s) : s)

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? (m ? `${h} t ${m} min` : `${h} t`) : `${m} min`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function recipeToMarkdown(r: ExportableRecipe, opts: ExportOptions = {}): string {
  const base = r.servings
  const shown = opts.servings ?? base
  const factor = scaleFactor(shown ?? 0, base)
  const scaled = base != null && shown != null && Math.abs(shown - base) > 1e-9

  const tags = [...new Set(['oppskrift', ...r.tags].map((t) => t.trim().replace(/\s+/g, '-').replace(/^#/, '')).filter(Boolean))]
  const created = (opts.today ?? new Date()).toISOString().slice(0, 10)
  const title = r.title.trim() || 'Oppskrift uten navn'

  const fm = ['---', `title: ${yq(title)}`]
  if (r.source_url) fm.push(`source: ${r.source_url}`)
  if (shown != null) fm.push(`servings: ${formatNumber(shown).replace(/\s/g, '')}`)
  if (scaled) fm.push(`scaled_from: ${formatNumber(base!).replace(/\s/g, '')}`)
  if (r.total_minutes) fm.push(`time: ${yq(formatMinutes(r.total_minutes))}`)
  fm.push(`tags: [${tags.map(yq).join(', ')}]`, `created: ${created}`, '---', '')

  const md = [...fm, `# ${title}`, '']
  if (r.description?.trim()) md.push(r.description.trim(), '')
  if (r.source_url) md.push(`Kilde: [${hostOf(r.source_url)}](${r.source_url})`, '')

  md.push('## Ingredienser', '')
  for (const g of r.ingredient_groups) {
    if (g.name?.trim()) md.push('', `### ${g.name.trim()}`)
    for (const ing of g.ingredients) {
      const d = displayIngredient(ing, factor, !!opts.grams, ing.food_id != null ? opts.measures?.get(ing.food_id) : undefined)
      md.push(`- [ ] ${ingredientText(d, ing.name, ing.note)}`)
    }
  }

  if (r.oven?.length) md.push('', '## Ovn', '', ...r.oven.map((o) => `- ${ovenStepText(o)}`))

  md.push('', '## Fremgangsmåte', '')
  let n = 0
  let lastGroup: string | null = null
  for (const s of r.steps) {
    const group = s.group_name?.trim() || null
    if (group !== lastGroup) {
      if (group) md.push('', `### ${group}`)
      n = 0
      lastGroup = group
    }
    md.push(`${++n}. ${s.text.trim()}`)
  }

  const tips = r.tips.map((t) => t.trim()).filter(Boolean)
  if (tips.length) md.push('', '## Tips', '', ...tips.map((t) => `- ${t}`))

  return md.join('\n').replace(/\n{3,}/g, '\n\n') + '\n'
}

/** Title with the characters Obsidian disallows removed. */
export function exportFilename(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 120)
    .trim()
  return `${name || 'Oppskrift'}.md`
}

/** Makes filenames unique inside a zip: "Pasta.md", "Pasta (2).md", ... */
export function uniqueFilenames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const key = n.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count === 1 ? n : n.replace(/\.md$/, ` (${count}).md`)
  })
}
