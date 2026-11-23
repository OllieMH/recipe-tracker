import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export default function AuthGuard() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/logg-inn" replace />
  return <Outlet />
}
