import { NavLink, Link, Outlet } from 'react-router-dom'
import { signOut, useAuth, useIsAdmin } from '@/lib/auth'
import { cn } from '@/lib/utils'
import OfflineBanner from '@/components/OfflineBanner'

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
      {/* pt: on an iPhone the installed app draws under the status bar, so keep the nav clear of it */}
      <header className="bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground print:hidden">
        {/* Phone: title and "Logg ut" on the first row, the links on their own row below.
            From sm up everything sits on one line. */}
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Link to="/" className="order-1 mr-3 text-xl font-extrabold tracking-tight text-white">
            Oppskrifter
          </Link>
          <div className="order-3 flex w-full items-center justify-between gap-x-4 sm:order-2 sm:w-auto sm:justify-start sm:gap-x-5">
            <NavLink to="/ny" className={navLink}>Ny oppskrift</NavLink>
            <NavLink to="/handleliste" className={navLink}>Handleliste</NavLink>
            <NavLink to="/omregning" className={navLink}>Omregning</NavLink>
            {isAdmin && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="order-2 ml-auto rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10 hover:text-white sm:order-3"
          >
            Logg ut
          </button>
        </nav>
      </header>
      <OfflineBanner />
      <Outlet />
    </div>
  )
}
