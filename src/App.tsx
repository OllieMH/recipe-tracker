import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

import LoginPage from '@/routes/LoginPage'
import SetPasswordPage from '@/routes/SetPasswordPage'
import RecipeListPage from '@/routes/RecipeListPage'
import ImportPage from '@/routes/ImportPage'
import RecipeDetailPage from '@/routes/RecipeDetailPage'
import RecipeEditPage from '@/routes/RecipeEditPage'
import ConverterPage from '@/routes/ConverterPage'
import AdminPage from '@/routes/AdminPage'
import AuthGuard from '@/components/AuthGuard'
import AdminGuard from '@/components/AdminGuard'
import AppLayout from '@/components/AppLayout'

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-muted-foreground text-sm">Laster …</span>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/logg-inn" element={<LoginPage />} />
      <Route path="/sett-passord" element={<SetPasswordPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/importer" element={<ImportPage />} />
          <Route path="/oppskrift/:id" element={<RecipeDetailPage />} />
          <Route path="/oppskrift/:id/rediger" element={<RecipeEditPage />} />
          <Route path="/omregning" element={<ConverterPage />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
