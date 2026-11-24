import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { readStoredUser } from './offline'

export interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
}

export const AuthContext = createContext<AuthState | null>(null)

/** Shared auth state. Must be used inside <AuthProvider>. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Subscribes to Supabase auth. Used once, by AuthProvider. */
export function useAuthState(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      // With an expired access token and no network, supabase-js reports "no session" but
      // keeps the saved login and refreshes it when the network is back (TOKEN_REFRESHED
      // below then takes over). Trust the saved login so an offline user is not sent to
      // the login page; a real sign-out clears it, and then this finds nothing.
      setUser(data.session?.user ?? readStoredUser())
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (session) setUser(session.user)
      // Only a real sign-out logs out. Other events without a session (INITIAL_SESSION when
      // the token could not be refreshed offline) keep the saved login, see above.
      else setUser(event === 'SIGNED_OUT' ? null : readStoredUser())
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, session, loading }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    // Offline the server cannot be told about it, so sign out on this device only.
    const local = await supabase.auth.signOut({ scope: 'local' })
    if (local.error) throw local.error
  }
}

/** Send a password-reset email. The link lands on /sett-passord. */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/sett-passord`,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/** Is the signed-in user an admin? Reads own profile row (allowed by RLS). */
export function useIsAdmin(userId: string | undefined) {
  return useQuery({
    queryKey: ['is-admin', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId!)
        .single()
      if (error) throw error
      return data.is_admin
    },
  })
}

/** Translate Supabase auth errors to Norwegian. */
export function authErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/invalid login credentials/i.test(msg)) return 'Feil e-post eller passord.'
  if (/email not confirmed/i.test(msg)) return 'E-posten er ikke bekreftet.'
  if (/same password|different from the old/i.test(msg)) return 'Det nye passordet må være forskjellig fra det gamle.'
  if (/weak|at least/i.test(msg)) return 'Passordet er for svakt. Bruk minst 8 tegn.'
  if (/rate limit|too many/i.test(msg)) return 'For mange forsøk. Prøv igjen om litt.'
  return 'Noe gikk galt. Prøv igjen.'
}
