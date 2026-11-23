import { z } from 'zod'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticate, checkDailyLimit, json } from '../_shared/guard.ts'
import { generateStructured, LlmError } from '../_shared/llm.ts'
import { RecipeSchema, type Recipe } from '../_shared/recipe-schema.ts'
import { FIX_PROMPT } from './prompt.ts'

const MAX_SOURCE = Number(Deno.env.get('IMPORT_MAX_CHARS') ?? 60000)

const InputSchema = z.object({
  recipe_id: z.string().uuid(),
  instruction: z.string().trim().min(3).max(1000),
})

/** Proposes a corrected recipe. Writes nothing: the client applies accepted changes. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const caller = await authenticate(req)
  if (caller instanceof Response) return caller

  let input: z.infer<typeof InputSchema>
  try {
    input = InputSchema.parse(await req.json())
  } catch {
    return json({ error: 'invalid_input' }, 400)
  }

  // Loaded as the user, so RLS decides whether they may see this recipe.
  const { data: r, error: loadErr } = await caller.user
    .from('recipes')
    .select('*, ingredient_groups(*, ingredients(*)), steps(*)')
    .eq('id', input.recipe_id)
    .maybeSingle()
  if (loadErr) {
    console.error(loadErr)
    return json({ error: 'internal' }, 500)
  }
  if (!r) return json({ error: 'not_found' }, 404)

  const limited = await checkDailyLimit(caller)
  if (limited) return limited

  const current: Recipe = {
    title: r.title,
    description: r.description,
    servings: r.servings != null ? Number(r.servings) : null,
    servings_unit: r.servings_unit,
    prep_minutes: r.prep_minutes,
    total_minutes: r.total_minutes,
    original_language: r.original_language ?? 'no',
    ingredient_groups: [...r.ingredient_groups]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({
        name: g.name,
        ingredients: [...g.ingredients]
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            original_text: i.original_text,
            amount: i.amount != null ? Number(i.amount) : null,
            amount_max: i.amount_max != null ? Number(i.amount_max) : null,
            unit: i.unit as Recipe['ingredient_groups'][number]['ingredients'][number]['unit'],
            original_amount: i.original_amount != null ? Number(i.original_amount) : null,
            original_unit: i.original_unit,
            name: i.name,
            note: i.note,
            scalable: i.scalable,
            food_match: null,
          })),
      })),
    steps: [...r.steps]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ group_name: s.group_name, text: s.text })),
    tips: r.tips,
    tags: r.tags,
    corrections: [],
    warnings: [],
  }

  const source = (r.import_raw_text ?? '').slice(0, MAX_SOURCE)
  const userContent =
    `INSTRUCTION:\n${input.instruction}\n\n` +
    `CURRENT RECIPE:\n${JSON.stringify(current)}\n\n` +
    `SOURCE TEXT:\n${source || '(not available)'}`

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
  try {
    const result = await generateStructured(FIX_PROMPT, userContent, RecipeSchema)
    await caller.admin.from('import_log').insert({
      user_id: caller.userId,
      model: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      ok: true,
    })
    return json({ recipe: result.data })
  } catch (err) {
    console.error('fix-recipe failed:', err)
    await caller.admin.from('import_log').insert({ user_id: caller.userId, model, ok: false })
    if (err instanceof LlmError && err.busy) return json({ error: 'llm_busy' }, 503)
    return json({ error: err instanceof LlmError ? 'llm_failed' : 'internal' }, 502)
  }
})
