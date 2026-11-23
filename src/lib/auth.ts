import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

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
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
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
