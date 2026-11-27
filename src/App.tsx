import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

import LoginPage from '@/routes/LoginPage'
import SetPasswordPage from '@/routes/SetPasswordPage'
import RecipeListPage from '@/routes/RecipeListPage'
import NewRecipePage from '@/routes/NewRecipePage'
import RecipeDetailPage from '@/routes/RecipeDetailPage'
import RecipeEditPage from '@/routes/RecipeEditPage'
import ConverterPage from '@/routes/ConverterPage'
import ShoppingListsPage from '@/routes/ShoppingListsPage'
import ShoppingListPage from '@/routes/ShoppingListPage'
import AdminPage from '@/routes/AdminPage'
import InstallPage from '@/routes/InstallPage'
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
          <Route path="/ny" element={<NewRecipePage />} />
          {/* the old address: bookmarks and the installed app keep working */}
          <Route path="/importer" element={<Navigate to="/ny" replace />} />
          <Route path="/oppskrift/:id" element={<RecipeDetailPage />} />
          <Route path="/oppskrift/:id/rediger" element={<RecipeEditPage />} />
          <Route path="/omregning" element={<ConverterPage />} />
          <Route path="/handleliste" element={<ShoppingListsPage />} />
          <Route path="/handleliste/:id" element={<ShoppingListPage />} />
          <Route path="/installer" element={<InstallPage />} />
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
