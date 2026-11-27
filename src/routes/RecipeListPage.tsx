import InstallHint from '@/components/InstallHint'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { fetchRecipes, formatMinutes, recipeMatches, useFavorites, useRecipeList, visibleRecipes } from '@/lib/recipes'
import { downloadBlob } from '@/lib/download'
import { thumbPathOf, useSignedUrls } from '@/lib/images'
import RecipeImage from '@/components/RecipeImage'
import { exportFilename, recipeToMarkdown, uniqueFilenames } from '@/lib/markdown'
import { Button } from '@/components/ui/button'
import { Clock, Lock, Plus, Search, Star, UtensilsCrossed, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Tab = 'alle' | 'favoritter' | 'mine'
const TABS: { id: Tab; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'favoritter', label: 'Favoritter' },
  { id: 'mine', label: 'Mine' },
]

export default function RecipeListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const recipes = useRecipeList()
  const favorites = useFavorites(user?.id)
  const [tab, setTab] = useState<Tab>('alle')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  // If the user has a private copy of a recipe, show the copy instead of the original.
  const visible = useMemo(() => visibleRecipes(recipes.data ?? [], user?.id), [recipes.data, user?.id])

  // Thumbnails for every recipe, requested once so filtering does not refetch URLs.
  const thumbUrls = useSignedUrls(visible.map((r) => (r.image_path ? thumbPathOf(r.image_path) : null)))

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of visible) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nb')).slice(0, 20)
  }, [visible])

  /** Zip of all favourites: one .md per recipe at its original servings and units. */
  async function exportFavorites() {
    setExportError(null)
    setExporting(true)
    try {
      const full = await fetchRecipes([...(favorites.data ?? [])])
      if (full.length === 0) {
        setExportError('Ingen favoritter å eksportere.')
        return
      }
      const names = uniqueFilenames(full.map((r) => exportFilename(r.title)))
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      full.forEach((r, i) => {
        zip.file(names[i], recipeToMarkdown({ ...r, servings: r.servings != null ? Number(r.servings) : null }))
      })
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `oppskrifter-favoritter-${new Date().toISOString().slice(0, 10)}.zip`)
    } catch {
      setExportError('Kunne ikke lage zip-filen. Prøv igjen.')
    } finally {
      setExporting(false)
    }
  }

  const q = query.trim().toLowerCase()
  const shown = visible.filter(
    (r) =>
      (tab === 'alle' ||
        (tab === 'mine' && r.owner_id === user?.id) ||
        (tab === 'favoritter' && favorites.data?.has(r.id))) &&
      (!tag || r.tags.includes(tag)) &&
      recipeMatches(r, q),
  )

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <InstallHint />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            placeholder="Søk i tittel, ingredienser og emneord"
            aria-label="Søk"
            className="h-11 pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button className="h-11" onClick={() => navigate('/ny')}>
          <Plus aria-hidden /> Ny oppskrift
        </Button>
      </div>

      <div role="tablist" className="flex gap-5 border-b border-foreground/20">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-[3px] py-2 text-base font-semibold transition-colors',
              tab === t.id ? 'border-berry text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'favoritter' && (favorites.data?.size ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={exportFavorites} disabled={exporting}>
            {exporting ? 'Lager zip …' : `Eksporter favoritter (${favorites.data!.size}) som .zip`}
          </Button>
          {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
        </div>
      )}

      {tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagCounts.map(([t, n]) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              aria-pressed={tag === t}
              className={cn(
                'rounded px-2.5 py-1 text-sm font-medium transition-colors',
                tag === t ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent',
              )}
            >
              {t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      {recipes.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {recipes.isError && <p className="text-sm text-destructive">Kunne ikke hente oppskrifter.</p>}

      {recipes.data && shown.length === 0 && (
        <div className="py-10 text-center text-muted-foreground">
          {visible.length === 0 ? (
            <>Ingen oppskrifter ennå. <Link to="/ny" className="font-semibold text-foreground underline">Lag eller importer den første</Link>.</>
          ) : tab === 'favoritter' && !q && !tag ? (
            'Du har ingen favoritter ennå.'
          ) : (
            'Ingen treff.'
          )}
        </div>
      )}

      <ul className="divide-y divide-foreground/15">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={`/oppskrift/${r.id}`} className="-mx-2 flex gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent/60">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-muted-foreground sm:size-28">
                {r.image_path ? (
                  <RecipeImage url={thumbUrls.data?.get(thumbPathOf(r.image_path))} alt="" className="h-full" />
                ) : (
                  <UtensilsCrossed className="size-7 opacity-50" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold leading-snug">{r.title}</h2>
                  {favorites.data?.has(r.id) && (
                    <Star className="mt-1 size-5 shrink-0 fill-berry text-berry" aria-label="Favoritt" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                  {r.total_minutes ? (
                    <span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />{formatMinutes(r.total_minutes)}</span>
                  ) : null}
                  {r.servings ? (
                    <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden />{r.servings} {r.servings_unit ?? 'porsjoner'}</span>
                  ) : null}
                  {r.parent_id ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Lock className="size-4" aria-hidden />Din versjon</span>
                  ) : r.visibility === 'private' ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Lock className="size-4" aria-hidden />Privat</span>
                  ) : null}
                </div>
                {r.tags.length > 0 && (
                  <p className="mt-1.5 truncate text-sm text-muted-foreground">{r.tags.slice(0, 4).join(', ')}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
