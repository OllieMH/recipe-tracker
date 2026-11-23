import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { formatMinutes, useFavorites, useRecipeList, type RecipeListItem } from '@/lib/recipes'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Tab = 'alle' | 'favoritter' | 'mine'
const TABS: { id: Tab; label: string }[] = [
  { id: 'alle', label: 'Alle' },
  { id: 'favoritter', label: 'Favoritter' },
  { id: 'mine', label: 'Mine' },
]

const norm = (s: string) => s.toLowerCase()

function matches(r: RecipeListItem, q: string): boolean {
  if (!q) return true
  const hay = [
    r.title,
    ...r.tags,
    ...r.ingredient_groups.flatMap((g) => g.ingredients.map((i) => i.name)),
  ].map(norm)
  return q.split(/\s+/).every((word) => hay.some((h) => h.includes(word)))
}

export default function RecipeListPage() {
  const { user } = useAuth()
  const recipes = useRecipeList()
  const favorites = useFavorites(user?.id)
  const [tab, setTab] = useState<Tab>('alle')
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)

  // If the user has a private copy of a recipe, show the copy instead of the original.
  const visible = useMemo(() => {
    const all = recipes.data ?? []
    const replaced = new Set(all.filter((r) => r.parent_id && r.owner_id === user?.id).map((r) => r.parent_id))
    return all.filter((r) => !replaced.has(r.id))
  }, [recipes.data, user?.id])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of visible) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nb')).slice(0, 20)
  }, [visible])

  const q = norm(query.trim())
  const shown = visible.filter(
    (r) =>
      (tab === 'alle' ||
        (tab === 'mine' && r.owner_id === user?.id) ||
        (tab === 'favoritter' && favorites.data?.has(r.id))) &&
      (!tag || r.tags.includes(tag)) &&
      matches(r, q),
  )

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <Input
        type="search"
        placeholder="Søk i tittel, ingredienser og emneord"
        aria-label="Søk"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div role="tablist" className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagCounts.map(([t, n]) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                tag === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
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
        <div className="py-10 text-center text-sm text-muted-foreground">
          {visible.length === 0 ? (
            <>Ingen oppskrifter ennå. <Link to="/importer" className="underline">Importer den første</Link>.</>
          ) : tab === 'favoritter' && !q && !tag ? (
            'Du har ingen favoritter ennå.'
          ) : (
            'Ingen treff.'
          )}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((r) => (
          <li key={r.id}>
            <Link to={`/oppskrift/${r.id}`} className="block h-full rounded-lg border p-3 hover:bg-accent/50">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium leading-snug">{r.title}</h2>
                {favorites.data?.has(r.id) && <span aria-label="Favoritt" title="Favoritt">★</span>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  r.parent_id ? 'Din versjon' : r.visibility === 'private' ? 'Privat' : null,
                  r.total_minutes ? formatMinutes(r.total_minutes) : null,
                  r.servings ? `${r.servings} ${r.servings_unit ?? 'porsjoner'}` : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {r.tags.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{r.tags.slice(0, 4).join(', ')}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
