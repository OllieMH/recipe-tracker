// Auth + daily rate limit shared by the LLM Edge Functions.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { corsHeaders } from './cors.ts'

export const DAILY_LIMIT = Number(Deno.env.get('IMPORT_DAILY_LIMIT') ?? 30)

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export interface Caller {
  userId: string
  /** Client acting as the signed-in user (RLS applies). */
  user: SupabaseClient
  /** Service-role client. Use only for import_log. */
  admin: SupabaseClient
}

/** Verifies the JWT. Returns the caller, or a ready-made error Response. */
export async function authenticate(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'not_signed_in' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await user.auth.getUser()
  if (error || !data.user) return json({ error: 'not_signed_in' }, 401)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  return { userId: data.user.id, user, admin }
}

/** Rolling 24h limit across all LLM calls. Failed attempts count too, to cap cost. */
export async function checkDailyLimit(c: Caller): Promise<Response | null> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count, error } = await c.admin
    .from('import_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', c.userId)
    .gte('created_at', since)
  if (error) {
    console.error(error)
    return json({ error: 'internal' }, 500)
  }
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'rate_limited', limit: DAILY_LIMIT }, 429)
  return null
}
