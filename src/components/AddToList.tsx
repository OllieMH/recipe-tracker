import { useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { Measures } from '@/lib/conversion'
import { formatNumber, scaleFactor } from '@/lib/scaling'
import { useFoods } from '@/lib/foods'
import { recipeToListItems, type ListableRecipe, type UnitMode } from '@/lib/recipe-to-list'
import { formatLineAmount } from '@/lib/shopping-merge'
import {
  aisleFor,
  useAddRecipeToList,
  useAisleMap,
  useCreateList,
  useRecipeRows,
  useShoppingLists,
} from '@/lib/shopping'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const LAST_LIST_KEY = 'shopping-last-list'

interface Props {
  recipe: ListableRecipe
  /** What the recipe is written for, and what the recipe page currently shows. */
  baseServings: number | null
  initialServings: number | null
  servingsUnit: string
  /** Gram/mål mode of the recipe page. */
  grams: boolean
  measures: ReadonlyMap<number, Measures> | undefined
  /** When set the list is fixed (opened from the list itself) and the list picker is hidden. */
  fixedList?: { id: string; name: string }
  /** Shown as "Tilbake" when the dialog sits behind a recipe picker. */
  onBack?: () => void
  onClose: () => void
  onAdded: (list: { id: string; name: string }) => void
}

export default function AddToList({
  recipe, baseServings, initialServings, servingsUnit, grams, measures, fixedList, onBack, onClose, onAdded,
}: Props) {
  const lists = useShoppingLists()
  const foods = useFoods()
  const aisleMap = useAisleMap()
  const createList = useCreateList()
  const addRecipe = useAddRecipeToList()

  const [chosen, setChosen] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [unticked, setUnticked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // Starts at the page's servings; changing it here does not change the page.
  const [servings, setServings] = useState<number | null>(initialServings)
  const factor = scaleFactor(servings ?? 0, baseServings)
  // Default: the unit you buy it in. If the recipe page is in gram mode, keep that.
  const [unitMode, setUnitMode] = useState<UnitMode>(grams ? 'grams' : 'shopping')
  const canGrams = (measures?.size ?? 0) > 0

  const all = lists.data ?? []
  const defaultId = useMemo(() => {
    let last: string | null = null
    try {
      last = localStorage.getItem(LAST_LIST_KEY)
    } catch {
      /* no storage: fall back to the newest list */
    }
    return all.find((l) => l.id === last)?.id ?? all[0]?.id ?? 'new'
  }, [all])
  const listId = fixedList?.id ?? chosen ?? defaultId

  const foodById = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f])), [foods.data])
  const rows = useMemo(
    () =>
      recipeToListItems(recipe, {
        factor,
        unitMode,
        measuresByFood: measures,
        aisleOf: (id) => aisleFor(id != null ? foodById.get(id) : null, aisleMap.data),
        categoryOf: (id) => (id != null ? (foodById.get(id)?.category ?? null) : null),
      }),
    [recipe, factor, unitMode, measures, foodById, aisleMap.data],
  )

  const existing = useRecipeRows(listId === 'new' ? undefined : listId, recipe.id)
  const picked = rows.filter((r) => !unticked.has(r.ingredientId))
  const busy = createList.isPending || addRecipe.isPending
  const canSubmit = picked.length > 0 && !busy && (listId !== 'new' || newName.trim().length > 0)

  function toggle(id: number) {
    setUnticked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function submit() {
    setError(null)
    try {
      let targetId = listId
      let name = fixedList?.name ?? all.find((l) => l.id === listId)?.name ?? ''
      if (listId === 'new') {
        name = newName.trim()
        targetId = await createList.mutateAsync(name)
      }
      await addRecipe.mutateAsync({ listId: targetId, recipeId: recipe.id, items: picked.map((r) => r.item) })
      try {
        localStorage.setItem(LAST_LIST_KEY, targetId)
      } catch {
        /* the list just is not remembered */
      }
      onAdded({ id: targetId, name })
    } catch {
      setError('Kunne ikke legge til i listen. Prøv igjen.')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Legg til i handleliste"
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-auto rounded-t-lg bg-card p-4 shadow-lg sm:rounded-lg">
        <div>
          <h2 className="text-xl font-bold">Legg til i handleliste</h2>
          <p className="text-sm text-muted-foreground">{recipe.title}</p>
        </div>

        {baseServings != null && servings != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium" id="servings-label">Porsjoner</span>
            <div
              className="flex items-center rounded-lg border border-foreground/35 bg-card"
              role="group"
              aria-labelledby="servings-label"
            >
              <Button
                variant="ghost" size="sm" aria-label="Færre porsjoner" className="size-10"
                disabled={servings <= 1}
                onClick={() => setServings(Math.max(1, servings - 1))}
              >
                <Minus aria-hidden />
              </Button>
              <span className="min-w-28 text-center text-sm font-semibold tabular-nums">
                {formatNumber(servings)} {servingsUnit}
              </span>
              <Button
                variant="ghost" size="sm" aria-label="Flere porsjoner" className="size-10"
                onClick={() => setServings(servings + 1)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="unit-mode" className="text-sm font-medium">Enheter</label>
          <Select
            id="unit-mode"
            className="w-auto min-w-56"
            value={unitMode}
            onChange={(e) => setUnitMode(e.target.value as UnitMode)}
          >
            <option value="shopping">Til handling (6 dl melk, 500 g mel)</option>
            <option value="recipe">Som i oppskriften</option>
            {canGrams && <option value="grams">Gram der det går</option>}
          </Select>
        </div>

        <div className="space-y-2">
          {fixedList ? (
            <p className="text-sm">
              <span className="font-medium">Liste:</span> {fixedList.name}
            </p>
          ) : (
            <>
              <label htmlFor="list-select" className="text-sm font-medium">Liste</label>
              <Select id="list-select" value={listId} onChange={(e) => setChosen(e.target.value)}>
                {all.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
                <option value="new">Ny liste …</option>
              </Select>
            </>
          )}
          {listId === 'new' && (
            <Input
              aria-label="Navn på ny liste"
              placeholder="F.eks. Ukeshandel"
              value={newName}
              maxLength={80}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
          {listId !== 'new' && (existing.data ?? 0) > 0 && (
            <p className="rounded-md bg-secondary p-2 text-sm">
              Denne oppskriften ligger allerede på listen. Legger du den til igjen, erstattes de gamle varene.
            </p>
          )}
        </div>

        <fieldset className="space-y-1">
          <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
            <span>Hva trenger du? ({picked.length} av {rows.length})</span>
            <span className="flex gap-3 font-normal">
              <button type="button" className="underline" onClick={() => setUnticked(new Set())}>Alle</button>
              <button type="button" className="underline" onClick={() => setUnticked(new Set(rows.map((r) => r.ingredientId)))}>Ingen</button>
            </span>
          </legend>
          <ul className="divide-y divide-border/60 rounded-md border border-border">
            {rows.map(({ ingredientId, item }) => {
              const amount = formatLineAmount({ amount: item.amount, amountMax: item.amount_max ?? null, unit: item.unit })
              return (
                <li key={ingredientId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-primary"
                      checked={!unticked.has(ingredientId)}
                      onChange={() => toggle(ingredientId)}
                    />
                    <span className="min-w-0 flex-1">{item.name}</span>
                    {amount && <span className="shrink-0 whitespace-nowrap font-semibold text-berry">{amount}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {onBack && <Button variant="outline" onClick={onBack} disabled={busy}>Tilbake</Button>}
          <Button variant="outline" onClick={onClose} disabled={busy}>Avbryt</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? 'Legger til …' : `Legg til ${picked.length} ${picked.length === 1 ? 'vare' : 'varer'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
