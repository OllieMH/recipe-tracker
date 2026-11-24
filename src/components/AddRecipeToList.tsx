import { useMemo, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { formatMinutes, recipeMatches, useMeasures, useRecipe, useRecipeList, visibleRecipes } from '@/lib/recipes'
import AddToList from '@/components/AddToList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  /** The list recipes are added to. */
  list: { id: string; name: string }
  onClose: () => void
}

function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto rounded-t-lg bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-lg">
        {children}
      </div>
    </div>
  )
}

/** Pick a recipe, then choose servings and ingredients; it goes onto this list. */
export default function AddRecipeToList({ list, onClose }: Props) {
  const { user } = useAuth()
  const recipes = useRecipeList()
  const [query, setQuery] = useState('')
  const [pickedId, setPickedId] = useState<string | null>(null)

  const visible = useMemo(() => visibleRecipes(recipes.data ?? [], user?.id), [recipes.data, user?.id])
  const q = query.trim().toLowerCase()
  const results = useMemo(() => visible.filter((r) => recipeMatches(r, q)).slice(0, 40), [visible, q])

  if (pickedId) {
    return <PickedRecipe id={pickedId} list={list} onBack={() => setPickedId(null)} onClose={onClose} />
  }

  return (
    <Overlay label="Legg til oppskrift" onClose={onClose}>
      <h2 className="text-xl font-bold">Legg til oppskrift</h2>
      <p className="text-sm text-muted-foreground">Velg en oppskrift for «{list.name}».</p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Søk etter oppskrift"
          placeholder="Søk i tittel, ingredienser og emneord"
          className="pl-9"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {recipes.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {recipes.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke hente oppskriftene.</p>}
      {recipes.data && results.length === 0 && <p className="text-sm text-muted-foreground">Ingen treff.</p>}

      {results.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPickedId(r.id)}
                className="block w-full px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="block font-medium">{r.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {[r.total_minutes ? formatMinutes(r.total_minutes) : null, r.tags.slice(0, 3).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>Avbryt</Button>
      </div>
    </Overlay>
  )
}

function PickedRecipe({
  id, list, onBack, onClose,
}: { id: string; list: { id: string; name: string }; onBack: () => void; onClose: () => void }) {
  const recipe = useRecipe(id)
  const r = recipe.data
  const foodIds = r ? r.ingredient_groups.flatMap((g) => g.ingredients.map((i) => i.food_id)).filter((x): x is number => x != null) : []
  const measures = useMeasures(foodIds)

  if (recipe.isLoading) {
    return (
      <Overlay label="Legg til oppskrift" onClose={onClose}>
        <p className="text-sm text-muted-foreground">Laster oppskriften …</p>
      </Overlay>
    )
  }
  if (!r) {
    return (
      <Overlay label="Legg til oppskrift" onClose={onClose}>
        <p role="alert" className="text-sm text-destructive">Kunne ikke hente oppskriften.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onBack}>Tilbake</Button>
          <Button variant="outline" onClick={onClose}>Lukk</Button>
        </div>
      </Overlay>
    )
  }

  const base = r.servings != null ? Number(r.servings) : null
  return (
    <AddToList
      recipe={r}
      baseServings={base}
      initialServings={base}
      servingsUnit={r.servings_unit ?? 'porsjoner'}
      grams={false}
      measures={measures.data}
      fixedList={list}
      onBack={onBack}
      onClose={onClose}
      onAdded={onClose}
    />
  )
}
