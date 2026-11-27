import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDownUp, ArrowLeft, BookOpen, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { automaticAisle, chooseAisle, effectiveOrder, rememberMove, type Aisle } from '@/lib/aisles'
import { useIsOnline } from '@/lib/offline'
import { autoMatchFood, useFoods } from '@/lib/foods'
import { useMeasures } from '@/lib/recipes'
import { parseQuickAdd } from '@/lib/quick-add'
import {
  useAddItem,
  useAisleMap,
  useAisleOverrides,
  useClearChecked,
  useDeleteItems,
  useDeleteList,
  useEditRows,
  useListAisleOverrides,
  useListMembers,
  useListRealtime,
  useRenameList,
  useRememberMove,
  useSetAisle,
  useSetChecked,
  useSetListAisleOrder,
  useShoppingItems,
  useShoppingList,
} from '@/lib/shopping'
import {
  adjustLine,
  applyMerge,
  convertLines,
  giveAmount,
  groupByAisle,
  mergeItems,
  relabelLine,
  suggestMerges,
  undoUpdates,
  type MergeSuggestion,
  type RowUpdate,
  type ShoppingLine,
} from '@/lib/shopping-merge'
import ShoppingLineRow from '@/components/ShoppingLineRow'
import MergePrompt from '@/components/MergePrompt'
import AddRecipeToList from '@/components/AddRecipeToList'
import ShareListPanel from '@/components/ShareListPanel'
import SectionOrderEditor from '@/components/SectionOrderEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Merge prompts the user said no to, remembered in this browser, per list. */
function useDismissed(listId: string) {
  const key = `shopping-dismissed:${listId}`
  const [set, setSet] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]'))
    } catch {
      return new Set<string>()
    }
  })
  const add = (sig: string) =>
    setSet((prev) => {
      const next = new Set(prev).add(sig)
      try {
        localStorage.setItem(key, JSON.stringify([...next]))
      } catch {
        /* private mode: the prompt just comes back next time */
      }
      return next
    })
  return [set, add] as const
}

/** A prompt is dismissed for these exact units; a new unit on the list brings it back. */
const signature = (s: MergeSuggestion) =>
  `${s.foodKey}|${s.lines.map((l) => l.unit).sort().join(',')}`

export default function ShoppingListPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const list = useShoppingList(id)
  const itemsQuery = useShoppingItems(id)
  const members = useListMembers(id)
  useListRealtime(id)
  const foods = useFoods()
  const aisleMap = useAisleMap()
  const overrides = useAisleOverrides()
  const listOverrides = useListAisleOverrides(id)
  const rememberMoveM = useRememberMove(id)
  const setOrder = useSetListAisleOrder(id)
  const foodById = useMemo(() => new Map((foods.data ?? []).map((f) => [f.id, f])), [foods.data])

  const addItem = useAddItem(id)
  const setChecked = useSetChecked(id)
  const setAisle = useSetAisle(id)
  const deleteItems = useDeleteItems(id)
  const clearChecked = useClearChecked(id)
  const editRows = useEditRows(id)
  const rename = useRenameList(id)
  const deleteList = useDeleteList(id)
  const online = useIsOnline()

  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickingRecipe, setPickingRecipe] = useState(false)
  const [ordering, setOrdering] = useState(false)
  const [dismissed, dismiss] = useDismissed(id)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])
  const measures = useMeasures(items.flatMap((i) => (i.food_id != null ? [i.food_id] : [])))
  const lines = useMemo(() => mergeItems(items), [items])
  const openLines = useMemo(() => lines.filter((l) => !l.checked), [lines])
  const doneLines = useMemo(() => lines.filter((l) => l.checked), [lines])

  // Only open lines are offered for merging; ticked ones are out of the way.
  const suggestions = useMemo(
    () => suggestMerges(openLines, measures.data).filter((s) => !dismissed.has(signature(s))),
    [openLines, measures.data, dismissed],
  )
  const suggestionByFood = useMemo(() => new Map(suggestions.map((s) => [s.foodKey, s])), [suggestions])
  const aisleOrder = useMemo(() => effectiveOrder(list.data?.aisle_order), [list.data?.aisle_order])
  const openGroups = useMemo(() => groupByAisle(openLines, aisleOrder), [openLines, aisleOrder])

  // Recipes whose items are on this list, so a whole recipe can be taken off again.
  const recipesOnList = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; rowIds: string[] }>()
    for (const i of items) {
      if (!i.recipe_id) continue
      const r = byId.get(i.recipe_id) ?? { id: i.recipe_id, title: i.recipe_title ?? 'Oppskrift', rowIds: [] }
      r.rowIds.push(i.id)
      byId.set(i.recipe_id, r)
    }
    return [...byId.values()]
  }, [items])

  const checkedRows = items.filter((i) => i.checked).length
  const mutationError = [addItem, setChecked, setAisle, deleteItems, clearChecked, editRows, rename, deleteList].find((m) => m.isError)

  if (list.isLoading) return <main className="p-4 text-sm text-muted-foreground">Laster …</main>
  if (!list.data && list.fetchStatus === 'paused') {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <p>Du er frakoblet, og denne listen er ikke lagret på telefonen ennå.</p>
        <Link to="/handleliste" className="text-sm underline">Til handlelistene</Link>
      </main>
    )
  }
  if (!list.data) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <p>Fant ikke listen, eller du har ikke tilgang til den.</p>
        <Link to="/handleliste" className="text-sm underline">Til handlelistene</Link>
      </main>
    )
  }
  const isOwner = list.data.owner_id === user?.id

  const edit = (updates: RowUpdate[], deleteIds: string[] = []) => editRows.mutate({ updates, deleteIds })

  function onAdd(e: FormEvent) {
    e.preventDefault()
    const parsed = parseQuickAdd(text)
    if (!parsed) return
    const food = foods.data ? autoMatchFood(foods.data, parsed.name) : null
    addItem.mutate({
      name: parsed.name,
      amount: parsed.amount,
      unit: parsed.unit,
      food_id: food?.id ?? null,
      aisle: chooseAisle({
        name: parsed.name,
        food,
        groupMap: aisleMap.data,
        shared: overrides.data,
        list: listOverrides.data,
      }),
    })
    // The item is already on the list (and, offline, waits to be sent): no need to wait.
    setText('')
    inputRef.current?.focus()
  }

  function onRename(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    rename.mutate(newName, { onSuccess: () => setRenaming(false) })
  }

  // "avhuket av Anna": only on shared lists, and only for other people's ticks
  const labelById = new Map((members.data ?? []).map((m) => [m.user_id, m.label]))
  const tickedBy = (line: ShoppingLine): string | undefined => {
    if (!line.checked || labelById.size < 2) return undefined
    const names = [
      ...new Set(
        line.items.flatMap((i) => (i.checked_by && i.checked_by !== user?.id ? [labelById.get(i.checked_by) ?? 'noen'] : [])),
      ),
    ]
    return names.length > 0 ? `avhuket av ${names.join(', ')}` : undefined
  }

  const renderLine = (line: ShoppingLine) => (
    <ShoppingLineRow
      key={line.id}
      line={line}
      note={tickedBy(line)}
      measures={measures.data}
      onToggle={() => setChecked.mutate({ ids: line.items.map((r) => r.id), checked: !line.checked })}
      onRemove={() => deleteItems.mutate(line.items.map((r) => r.id))}
      onUndo={() => edit(undoUpdates([line]))}
      onConvert={(unit) => edit(convertLines([line], unit, measures.data))}
      onSetUnit={(unit) => edit(relabelLine(line, unit))}
      onSetAisle={(aisle) => {
        setAisle.mutate({ ids: line.items.map((r) => r.id), aisle })
        // Remember it for next time: for everyone, or for this list only when "Fri for" is involved.
        for (const item of line.items.filter((r, i, all) => all.findIndex((x) => x.name === r.name) === i)) {
          const automatic = automaticAisle({
            name: item.name,
            food: item.food_id != null ? foodById.get(item.food_id) : null,
            groupMap: aisleMap.data,
            shared: overrides.data,
          })
          rememberMoveM.mutate({ name: item.name, from: line.aisle, memory: rememberMove(line.aisle, aisle as Aisle, automatic) })
        }
      }}
      onSetAmount={(amount, unit) => {
        const adj = line.amount == null ? giveAmount(line, amount, unit) : adjustLine(line, amount)
        edit(adj.updates, adj.deleteIds)
      }}
    />
  )

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <Link to="/handleliste" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Handlelister
      </Link>

      <header className="space-y-1">
        {renaming ? (
          <form onSubmit={onRename} className="flex gap-2">
            <Input aria-label="Nytt navn" value={newName} maxLength={80} autoFocus onChange={(e) => setNewName(e.target.value)} />
            <Button type="submit" disabled={rename.isPending || !newName.trim()}>Lagre</Button>
            <Button type="button" variant="outline" onClick={() => setRenaming(false)}>Avbryt</Button>
          </form>
        ) : (
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 flex-1 break-words text-3xl font-extrabold tracking-tight">{list.data.name}</h1>
            {isOwner && online && (
              <button
                type="button"
                aria-label="Gi listen nytt navn"
                onClick={() => { setNewName(list.data!.name); setRenaming(true) }}
                className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <Pencil className="size-4" />
              </button>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {items.length > 0 ? `${items.length - checkedRows} igjen av ${items.length}` : 'Ingen varer ennå'}
        </p>
      </header>

      <ShareListPanel
        listId={id}
        isOwner={isOwner}
        userId={user?.id}
        onLeft={() => navigate('/handleliste', { replace: true })}
      />

      <form onSubmit={onAdd} className="flex gap-2">
        <Input
          ref={inputRef}
          aria-label="Legg til vare"
          placeholder="Legg til vare, f.eks. 2 dl melk"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim()} aria-label="Legg til">
          <Plus className="size-4" /> Legg til
        </Button>
      </form>

      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={!online}
          title={online ? undefined : 'Krever nett'}
          onClick={() => setPickingRecipe(true)}
        >
          <BookOpen aria-hidden /> Legg til oppskrift
        </Button>
      </div>
      {pickingRecipe && (
        <AddRecipeToList list={{ id, name: list.data.name }} onClose={() => setPickingRecipe(false)} />
      )}

      {recipesOnList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Fra oppskrifter:</span>
          {recipesOnList.map((r) => (
            <span key={r.id} className="inline-flex items-center rounded-full border border-border bg-card pl-3">
              <Link to={`/oppskrift/${r.id}`} className="py-1 hover:underline">{r.title}</Link>
              <button
                type="button"
                aria-label={`Fjern ${r.title} fra listen`}
                onClick={() => deleteItems.mutate(r.rowIds)}
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}

      {mutationError && <p role="alert" className="text-sm text-destructive">Noe gikk galt. Prøv igjen.</p>}
      {itemsQuery.isLoading && <p className="text-sm text-muted-foreground">Laster varer …</p>}
      {itemsQuery.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke hente varene.</p>}

      {ordering ? (
        <SectionOrderEditor
          initial={aisleOrder}
          inUse={new Set(openGroups.map((g) => g.aisle))}
          saving={setOrder.isPending}
          onSave={(order) => setOrder.mutate(order, { onSuccess: () => setOrdering(false) })}
          onReset={() => setOrder.mutate(null, { onSuccess: () => setOrdering(false) })}
          onCancel={() => setOrdering(false)}
        />
      ) : (
        openGroups.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              disabled={!online}
              title={online ? undefined : 'Krever nett'}
              onClick={() => setOrdering(true)}
            >
              <ArrowDownUp aria-hidden /> Endre rekkefølge
            </Button>
          </div>
        )
      )}
      {setOrder.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke lagre rekkefølgen.</p>}

      {openGroups.length > 0 && (
        <ul className="rounded-lg border border-border bg-card px-1 pb-1">
          {openGroups.flatMap((g) => {
            // the merge prompt for an ingredient sits under the last of its lines in this aisle
            const lastIndex = new Map<string, number>()
            g.lines.forEach((l, i) => lastIndex.set(l.foodKey, i))
            return [
              <li key={`aisle-${g.aisle}`} className="px-2 pb-0.5 pt-3 text-xs text-muted-foreground first:pt-2">
                {g.aisle}
              </li>,
              ...g.lines.flatMap((line, i) => {
                const rows = [renderLine(line)]
                const s = suggestionByFood.get(line.foodKey)
                if (s && lastIndex.get(line.foodKey) === i) {
                  rows.push(
                    <li key={`merge-${line.foodKey}`} className="list-none px-1 pb-2">
                      <MergePrompt
                        suggestion={s}
                        onMerge={(unit) => edit(applyMerge(s, unit, measures.data))}
                        onDismiss={() => dismiss(signature(s))}
                      />
                    </li>,
                  )
                }
                return rows
              }),
            ]
          })}
        </ul>
      )}

      {items.length > 0 && openLines.length === 0 && (
        <p className="text-sm text-muted-foreground">Alt er avhuket.</p>
      )}

      {doneLines.length > 0 && (
        <details className="rounded-lg border border-border/60 bg-card/50 px-1 text-sm">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-muted-foreground">
            Avhuket ({doneLines.length})
          </summary>
          <ul>{doneLines.map(renderLine)}</ul>
          <div className="px-3 pb-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => clearChecked.mutate()} disabled={clearChecked.isPending}>
              Fjern avhukede
            </Button>
          </div>
        </details>
      )}

      {isOwner && (
        <div className="border-t border-border/60 pt-4">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Slette «{list.data.name}» og alle varene?</span>
              <Button
                variant="destructive"
                size="sm"
                disabled={!online || deleteList.isPending}
                onClick={() => deleteList.mutate(undefined, { onSuccess: () => navigate('/handleliste', { replace: true }) })}
              >
                Ja, slett
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Avbryt</Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={!online}
              title={online ? undefined : 'Krever nett'}
              onClick={() => setConfirmDelete(true)}
            >
              Slett liste
            </Button>
          )}
        </div>
      )}
    </main>
  )
}
