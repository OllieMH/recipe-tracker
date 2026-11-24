import { NavLink, Link, Outlet } from 'react-router-dom'
import { signOut, useAuth, useIsAdmin } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'border-b-2 py-1 text-sm font-medium transition-colors',
    isActive ? 'border-berry text-white' : 'border-transparent text-white/70 hover:text-white',
  )

export default function AppLayout() {
  const { user } = useAuth()
  const { data: isAdmin } = useIsAdmin(user?.id)

  return (
    <div className="min-h-screen">
      <header className="bg-primary text-primary-foreground print:hidden">
        <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
          <Link to="/" className="mr-3 text-xl font-extrabold tracking-tight text-white">
            Oppskrifter
          </Link>
          <NavLink to="/importer" className={navLink}>Importer</NavLink>
          <NavLink to="/handleliste" className={navLink}>Handleliste</NavLink>
          <NavLink to="/omregning" className={navLink}>Omregning</NavLink>
          {isAdmin && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="ml-auto rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            Logg ut
          </button>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
