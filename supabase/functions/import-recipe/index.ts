import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { corsHeaders } from '../_shared/cors.ts'
import { generateStructured, LlmError } from '../_shared/llm.ts'
import { RecipeSchema } from '../_shared/recipe-schema.ts'
import { SYSTEM_PROMPT } from './prompt.ts'

const MAX_CHARS = Number(Deno.env.get('IMPORT_MAX_CHARS') ?? 60000)
const DAILY_LIMIT = Number(Deno.env.get('IMPORT_DAILY_LIMIT') ?? 30)

const InputSchema = z.object({ text: z.string(), translate: z.boolean() })

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'not_signed_in' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'not_signed_in' }, 401)
  const userId = userData.user.id

  let input: z.infer<typeof InputSchema>
  try {
    input = InputSchema.parse(await req.json())
  } catch {
    return json({ error: 'invalid_input' }, 400)
  }
  const text = input.text.trim()
  if (text.length < 20) return json({ error: 'text_too_short' }, 400)
  if (text.length > MAX_CHARS) return json({ error: 'text_too_long', max: MAX_CHARS }, 413)

  // Rolling 24h limit. Failed attempts count too, to cap cost.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count, error: countErr } = await admin
    .from('import_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since)
  if (countErr) {
    console.error(countErr)
    return json({ error: 'internal' }, 500)
  }
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'rate_limited', limit: DAILY_LIMIT }, 429)

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
  try {
    const result = await generateStructured(
      SYSTEM_PROMPT,
      `TRANSLATE: ${input.translate}\n\nPAGE TEXT:\n${text}`,
      RecipeSchema,
    )
    await admin.from('import_log').insert({
      user_id: userId,
      model: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      ok: true,
    })
    return json({ recipe: result.data })
  } catch (err) {
    console.error('import-recipe failed:', err)
    await admin.from('import_log').insert({ user_id: userId, model, ok: false })
    if (err instanceof LlmError && err.busy) return json({ error: 'llm_busy' }, 503)
    const code = err instanceof LlmError ? 'llm_failed' : 'internal'
    return json({ error: code }, 502)
  }
})
