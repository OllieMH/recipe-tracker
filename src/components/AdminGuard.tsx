import { Navigate, Outlet } from 'react-router-dom'
import { useAuth, useIsAdmin } from '@/lib/auth'

export default function AdminGuard() {
  const { user } = useAuth()
  const { data: isAdmin, isLoading } = useIsAdmin(user?.id)

  if (isLoading) return null
  if (!isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
