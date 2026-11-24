import { z } from 'zod'
import { corsHeaders } from '../_shared/cors.ts'
import { authenticate, checkDailyLimit, json } from '../_shared/guard.ts'
import { checkImages } from '../_shared/image-input.ts'
import { generateStructured, LlmError } from '../_shared/llm.ts'
import { RecipeSchema } from '../_shared/recipe-schema.ts'
import { SYSTEM_PROMPT } from './prompt.ts'

const MAX_CHARS = Number(Deno.env.get('IMPORT_MAX_CHARS') ?? 60000)

// Pasted text, photos/screenshots, or both. Older clients send only text.
const InputSchema = z.object({
  text: z.string().optional(),
  images: z.array(z.object({ mime_type: z.string(), data: z.string() })).optional(),
  translate: z.boolean(),
})

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
  const text = (input.text ?? '').trim()
  const images = input.images ?? []
  if (images.length === 0) {
    if (text.length < 20) return json({ error: 'text_too_short' }, 400)
  } else {
    const problem = checkImages(images)
    if (problem !== 'ok') return json({ error: problem }, problem === 'images_too_large' ? 413 : 400)
  }
  if (text.length > MAX_CHARS) return json({ error: 'text_too_long', max: MAX_CHARS }, 413)

  const limited = await checkDailyLimit(caller)
  if (limited) return limited

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
  try {
    const result = await generateStructured(
      SYSTEM_PROMPT,
      images.length > 0
        ? `TRANSLATE: ${input.translate}\n\nThe recipe is in the ${images.length} attached image(s), in page order.${text ? `\n\nEXTRA TEXT:\n${text}` : ''}`
        : `TRANSLATE: ${input.translate}\n\nPAGE TEXT:\n${text}`,
      RecipeSchema,
      images,
    )
    await caller.admin.from('import_log').insert({
      user_id: caller.userId,
      model: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      ok: true,
    })
    return json({ recipe: result.data })
  } catch (err) {
    console.error('import-recipe failed:', err)
    await caller.admin.from('import_log').insert({ user_id: caller.userId, model, ok: false })
    if (err instanceof LlmError && err.quota) return json({ error: 'llm_quota' }, 503)
    if (err instanceof LlmError && err.busy) return json({ error: 'llm_busy' }, 503)
    return json({ error: err instanceof LlmError ? 'llm_failed' : 'internal' }, 502)
  }
})
