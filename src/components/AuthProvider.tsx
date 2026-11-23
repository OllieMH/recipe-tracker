import type { ReactNode } from 'react'
import { AuthContext, useAuthState } from '@/lib/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useAuthState()
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
