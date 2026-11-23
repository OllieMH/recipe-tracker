import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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
  if (!authHeader) return json({ error: 'Not signed in' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  // Verify the caller is an admin (is_admin() runs under the caller's JWT)
  const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin')
  if (adminErr || isAdmin !== true) return json({ error: 'Forbidden' }, 403)

  let body: { email?: unknown; display_name?: unknown; redirect_to?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email' }, 400)
  const displayName =
    typeof body.display_name === 'string' && body.display_name.trim()
      ? body.display_name.trim().slice(0, 80)
      : undefined
  const redirectTo = typeof body.redirect_to === 'string' ? body.redirect_to : undefined

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: displayName ? { display_name: displayName } : undefined,
  })
  if (error) return json({ error: error.message }, 400)

  return json({ ok: true })
})
