import { Link, Outlet } from 'react-router-dom'
import { signOut, useAuth, useIsAdmin } from '@/lib/auth'
import { Button } from '@/components/ui/button'

export default function AppLayout() {
  const { user } = useAuth()
  const { data: isAdmin } = useIsAdmin(user?.id)

  return (
    <div className="min-h-screen">
      <header className="border-b print:hidden">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
          <Link to="/" className="font-semibold">Oppskrift</Link>
          <Link to="/importer" className="text-muted-foreground hover:text-foreground">Importer</Link>
          <Link to="/omregning" className="text-muted-foreground hover:text-foreground">Omregning</Link>
          {isAdmin && (
            <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void signOut()}>
            Logg ut
          </Button>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
