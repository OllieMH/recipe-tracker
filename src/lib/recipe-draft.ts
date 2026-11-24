import { supabase } from './supabase'
import { autoMatchFood, type Food } from './foods'
import { removeImageFiles } from './images'
import type { Recipe } from './recipe-schema'
import type { RecipeDetail } from './recipes'

/** Editable form state: numbers are strings so users can type "2,5" freely. */
export interface DraftIngredient {
  key: string
  original_text: string
  amount: string
  amount_max: string
  unit: string
  original_amount: number | null
  original_unit: string | null
  name: string
  note: string
  scalable: boolean
  food_id: number | null
}

export interface DraftGroup {
  key: string
  name: string
  ingredients: DraftIngredient[]
}

export interface DraftStep {
  key: string
  group_name: string
  text: string
}

export interface DraftRecipe {
  visibility: 'public' | 'private'
  title: string
  description: string
  servings: string
  servings_unit: string
  prep_minutes: string
  total_minutes: string
  source_url: string
  original_language: string
  was_translated: boolean
  tags: string
  tips: string
  groups: DraftGroup[]
  steps: DraftStep[]
  import_raw_text: string | null
  corrections: Recipe['corrections']
  warnings: string[]
}

let counter = 0
export const newKey = () => `k${++counter}`

export const numStr = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

/** Parses "2,5", "1/2", "½" style input. Returns null for empty / invalid. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const frac: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }
  if (t in frac) return frac[t]
  const m = t.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2])
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function emptyIngredient(): DraftIngredient {
  return {
    key: newKey(), original_text: '', amount: '', amount_max: '', unit: '',
    original_amount: null, original_unit: null, name: '', note: '',
    scalable: true, food_id: null,
  }
}

/** A blank recipe for writing one from scratch: one empty ingredient group, one empty step. */
export function emptyDraft(visibility: 'public' | 'private' = 'public'): DraftRecipe {
  return {
    visibility,
    title: '',
    description: '',
    servings: '',
    servings_unit: '',
    prep_minutes: '',
    total_minutes: '',
    source_url: '',
    original_language: '',
    was_translated: false,
    tags: '',
    tips: '',
    groups: [{ key: newKey(), name: '', ingredients: [emptyIngredient()] }],
    steps: [{ key: newKey(), group_name: '', text: '' }],
    import_raw_text: null,
    corrections: [],
    warnings: [],
  }
}

export function draftFromLlm(
  r: Recipe,
  opts: { foods: Food[]; visibility: 'public' | 'private'; translated: boolean; rawText: string | null; sourceUrl: string },
): DraftRecipe {
  return {
    visibility: opts.visibility,
    title: r.title,
    description: r.description ?? '',
    servings: numStr(r.servings),
    servings_unit: r.servings_unit ?? '',
    prep_minutes: numStr(r.prep_minutes),
    total_minutes: numStr(r.total_minutes),
    source_url: opts.sourceUrl,
    original_language: r.original_language,
    was_translated: opts.translated && r.original_language !== 'no' && r.original_language !== 'nb',
    tags: r.tags.join(', '),
    tips: r.tips.join('\n'),
    groups: r.ingredient_groups.map((g) => ({
      key: newKey(),
      name: g.name ?? '',
      ingredients: g.ingredients.map((i) => ({
        key: newKey(),
        original_text: i.original_text,
        amount: numStr(i.amount),
        amount_max: numStr(i.amount_max),
        unit: i.unit ?? '',
        original_amount: i.original_amount,
        original_unit: i.original_unit,
        name: i.name,
        note: i.note ?? '',
        scalable: i.scalable,
        food_id: autoMatchFood(opts.foods, i.food_match, i.name)?.id ?? null,
      })),
    })),
    steps: r.steps.map((s) => ({ key: newKey(), group_name: s.group_name ?? '', text: s.text })),
    import_raw_text: opts.rawText,
    corrections: r.corrections,
    warnings: r.servings == null
      ? ['Fant ikke antall porsjoner. Fyll inn selv, ellers kan ikke oppskriften skaleres.', ...r.warnings]
      : r.warnings,
  }
}

/** Builds the editable form state from a saved recipe (edit page, Fix with AI). */
export function draftFromRecipe(r: RecipeDetail): DraftRecipe {
  return {
    visibility: r.visibility as 'public' | 'private',
    title: r.title,
    description: r.description ?? '',
    servings: numStr(r.servings != null ? Number(r.servings) : null),
    servings_unit: r.servings_unit ?? '',
    prep_minutes: numStr(r.prep_minutes),
    total_minutes: numStr(r.total_minutes),
    source_url: r.source_url ?? '',
    original_language: r.original_language ?? '',
    was_translated: r.was_translated,
    tags: r.tags.join(', '),
    tips: r.tips.join('\n'),
    groups: r.ingredient_groups.map((g) => ({
      key: newKey(),
      name: g.name ?? '',
      ingredients: g.ingredients.map((i) => ({
        key: newKey(),
        original_text: i.original_text,
        amount: numStr(i.amount != null ? Number(i.amount) : null),
        amount_max: numStr(i.amount_max != null ? Number(i.amount_max) : null),
        unit: i.unit ?? '',
        original_amount: i.original_amount != null ? Number(i.original_amount) : null,
        original_unit: i.original_unit,
        name: i.name,
        note: i.note ?? '',
        scalable: i.scalable,
        food_id: i.food_id,
      })),
    })),
    steps: r.steps.map((st) => ({ key: newKey(), group_name: st.group_name ?? '', text: st.text })),
    import_raw_text: r.import_raw_text,
    corrections: [],
    warnings: [],
  }
}

export function validateDraft(d: DraftRecipe): string | null {
  if (!d.title.trim()) return 'Oppskriften trenger en tittel.'
  const ingredients = d.groups.flatMap((g) => g.ingredients)
  if (ingredients.length === 0) return 'Legg til minst én ingrediens.'
  if (ingredients.some((i) => !i.name.trim())) return 'Alle ingredienser må ha et navn.'
  if (d.steps.length === 0) return 'Legg til minst ett steg.'
  if (d.steps.some((s) => !s.text.trim())) return 'Alle steg må ha tekst.'
  for (const [label, v] of [
    ['porsjoner', d.servings], ['forberedelsestid', d.prep_minutes], ['total tid', d.total_minutes],
  ] as const) {
    if (v.trim() && parseNumber(v) == null) return `Ugyldig tall for ${label}.`
  }
  for (const i of ingredients) {
    if ((i.amount.trim() && parseNumber(i.amount) == null) || (i.amount_max.trim() && parseNumber(i.amount_max) == null)) {
      return `Ugyldig mengde for «${i.name}».`
    }
  }
  return null
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function draftToPayload(d: DraftRecipe) {
  const url = d.source_url.trim()
  return {
    visibility: d.visibility,
    title: d.title.trim(),
    description: d.description.trim() || null,
    servings: parseNumber(d.servings),
    servings_unit: d.servings_unit.trim() || null,
    prep_minutes: parseNumber(d.prep_minutes) != null ? Math.round(parseNumber(d.prep_minutes)!) : null,
    total_minutes: parseNumber(d.total_minutes) != null ? Math.round(parseNumber(d.total_minutes)!) : null,
    source_url: url || null,
    source_site: url ? hostOf(url) : null,
    original_language: d.original_language || null,
    was_translated: d.was_translated,
    tags: d.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    tips: d.tips.split('\n').map((t) => t.trim()).filter(Boolean),
    import_raw_text: d.import_raw_text,
    ingredient_groups: d.groups
      .filter((g) => g.ingredients.length > 0)
      .map((g) => ({
        name: g.name.trim() || null,
        ingredients: g.ingredients.map((i) => ({
          amount: parseNumber(i.amount),
          amount_max: parseNumber(i.amount_max),
          unit: i.unit || null,
          name: i.name.trim(),
          note: i.note.trim() || null,
          scalable: i.scalable,
          food_id: i.food_id,
          original_text: i.original_text || i.name.trim(),
          original_amount: i.original_amount,
          original_unit: i.original_unit,
        })),
      })),
    steps: d.steps.map((s) => ({ group_name: s.group_name.trim() || null, text: s.text.trim() })),
  }
}

export async function saveRecipe(d: DraftRecipe): Promise<string> {
  const { data, error } = await supabase.rpc('save_recipe', { payload: draftToPayload(d) })
  if (error) throw error
  return data
}

const LLM_ERRORS: Record<string, string> = {
  not_signed_in: 'Du er ikke logget inn.',
  invalid_input: 'Ugyldig innhold.',
  not_found: 'Fant ikke oppskriften.',
  text_too_short: 'Teksten er for kort til å være en oppskrift.',
  text_too_long: 'Teksten er for lang. Lim inn bare selve oppskriften.',
  too_many_images: 'Du kan bruke opptil 10 bilder om gangen.',
  images_too_large: 'Bildene er for store. Prøv færre bilder eller lavere oppløsning.',
  rate_limited: 'Du har nådd dagens grense for KI-bruk. Prøv igjen i morgen.',
  llm_busy: 'KI-tjenesten er travel akkurat nå. Prøv igjen om litt.',
  llm_quota: 'KI-tjenestens grense for i dag er nådd. Prøv igjen i morgen, eller bruk «Skriv selv».',
  llm_failed: 'Kunne ikke tolke svaret fra KI. Prøv igjen.',
  internal: 'Noe gikk galt. Prøv igjen.',
}

async function invokeLlm(fn: string, body: Record<string, unknown>): Promise<Recipe> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    const res = await (error as { context?: Response }).context?.json().catch(() => null)
    throw new Error(LLM_ERRORS[res?.error as string] ?? LLM_ERRORS.internal)
  }
  return (data as { recipe: Recipe }).recipe
}

/** Calls the import-recipe Edge Function and returns the structured recipe. */
export function importRecipe(text: string, translate: boolean): Promise<Recipe> {
  return invokeLlm('import-recipe', { text, translate })
}

/** Same function, with photos or screenshots (already prepared with prepareForAi) instead of text. */
export function importRecipeFromImages(
  images: { mime_type: string; data: string }[],
  translate: boolean,
): Promise<Recipe> {
  return invokeLlm('import-recipe', { images, translate })
}

/** Calls fix-recipe: returns a proposed corrected recipe. Nothing is saved. */
export function fixRecipe(recipeId: string, instruction: string): Promise<Recipe> {
  return invokeLlm('fix-recipe', { recipe_id: recipeId, instruction })
}

export async function updateRecipe(recipeId: string, d: DraftRecipe): Promise<void> {
  const { error } = await supabase.rpc('update_recipe', { recipe_id: recipeId, payload: draftToPayload(d) })
  if (error) throw error
}

/** "Lag min versjon": private copy linked to the original. Returns the copy's id. */
export async function copyRecipe(sourceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('copy_recipe', { source_id: sourceId })
  if (error) throw error
  return data
}

export async function deleteRecipe(recipeId: string, imagePath?: string | null): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId)
  if (error) throw error
  // The row is gone; clean up its picture files (only those in the recipe's own folder).
  await removeImageFiles(recipeId, imagePath).catch(() => undefined)
}
