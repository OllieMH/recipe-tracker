import { useState } from 'react'
import { CANONICAL_UNITS } from '@/lib/recipe-schema'
import { emptyIngredient, newKey, numStr, type DraftGroup, type DraftIngredient, type DraftRecipe } from '@/lib/recipe-draft'
import { autoMatchFood, type Food } from '@/lib/foods'
import { parseIngredientLines } from '@/lib/quick-add'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import FoodPicker from '@/components/FoodPicker'
import OvenFields from '@/components/OvenFields'

interface Props {
  draft: DraftRecipe
  onChange: (d: DraftRecipe) => void
  foods: Food[]
}

const HIGHLIGHT = 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/** Review / edit form. Reused by the edit page in M7. */
export default function RecipeForm({ draft, onChange, foods }: Props) {
  const set = <K extends keyof DraftRecipe>(k: K, v: DraftRecipe[K]) => onChange({ ...draft, [k]: v })

  // Which steps / ingredients did the LLM touch? Field strings look like 'steps[2]' or 'ingredients.flour.amount'.
  const correctedSteps = new Set<number>()
  const correctedText: string[] = []
  for (const c of draft.corrections) {
    const m = c.field.match(/steps\[(\d+)\]/)
    if (m) correctedSteps.add(Number(m[1]))
    else correctedText.push(c.field.toLowerCase())
  }
  const isCorrectedIngredient = (name: string) =>
    name.trim().length > 2 && correctedText.some((f) => f.includes(name.trim().toLowerCase()))

  const [pasteGroup, setPasteGroup] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')

  const swap = <T,>(items: T[], i: number, j: number): T[] => {
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }

  const updateGroup = (gi: number, g: DraftGroup) =>
    set('groups', draft.groups.map((x, i) => (i === gi ? g : x)))

  /** "2 dl melk" lines become ingredient rows (units checked, foods linked); blank placeholder rows make way. */
  function addPastedLines(gi: number) {
    const lines = parseIngredientLines(pasteText)
    if (lines.length === 0) return
    const g = draft.groups[gi]
    const rows: DraftIngredient[] = lines.map((l) => ({
      ...emptyIngredient(),
      name: l.name,
      amount: numStr(l.amount),
      unit: l.unit && (CANONICAL_UNITS as readonly string[]).includes(l.unit) ? l.unit : '',
      food_id: autoMatchFood(foods, l.name)?.id ?? null,
    }))
    const isBlank = (i: DraftIngredient) => !i.name.trim() && !i.amount.trim() && !i.note.trim()
    updateGroup(gi, { ...g, ingredients: [...g.ingredients.filter((i) => !isBlank(i)), ...rows] })
    setPasteText('')
    setPasteGroup(null)
  }
  const updateIngredient = (gi: number, ii: number, patch: Partial<DraftIngredient>) => {
    const g = draft.groups[gi]
    updateGroup(gi, { ...g, ingredients: g.ingredients.map((x, i) => (i === ii ? { ...x, ...patch } : x)) })
  }

  return (
    <div className="space-y-8">
      {(draft.corrections.length > 0 || draft.warnings.length > 0) && (
        <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          {draft.warnings.length > 0 && (
            <div>
              <h2 className="font-semibold">Merk</h2>
              <ul className="list-disc pl-5">
                {draft.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {draft.corrections.length > 0 && (
            <div>
              <h2 className="font-semibold">Rettelser fra KI ({draft.corrections.length})</h2>
              <ul className="space-y-1">
                {draft.corrections.map((c, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{c.field}:</span>{' '}
                    <s>{c.before}</s> → <strong>{c.after}</strong>
                    <span className="text-muted-foreground"> ({c.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <Field label="Tittel" id="title">
          <Input id="title" value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Beskrivelse" id="description">
          <Textarea id="description" value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Porsjoner" id="servings">
            <Input id="servings" inputMode="decimal" value={draft.servings}
              className={draft.servings.trim() ? '' : HIGHLIGHT}
              onChange={(e) => set('servings', e.target.value)} />
          </Field>
          <Field label="Enhet" id="servings_unit">
            <Input id="servings_unit" placeholder="porsjoner" value={draft.servings_unit} onChange={(e) => set('servings_unit', e.target.value)} />
          </Field>
          <Field label="Forberedelse (min)" id="prep">
            <Input id="prep" inputMode="numeric" value={draft.prep_minutes} onChange={(e) => set('prep_minutes', e.target.value)} />
          </Field>
          <Field label="Total tid (min)" id="total">
            <Input id="total" inputMode="numeric" value={draft.total_minutes} onChange={(e) => set('total_minutes', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kilde (URL)" id="source">
            <Input id="source" type="url" placeholder="https://…" value={draft.source_url} onChange={(e) => set('source_url', e.target.value)} />
          </Field>
          <Field label="Emneord (kommaseparert)" id="tags">
            <Input id="tags" value={draft.tags} onChange={(e) => set('tags', e.target.value)} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Ingredienser</h2>
        <p className="text-xs text-muted-foreground">
          «Maks» fylles ut bare ved intervall, f.eks. «2–3 ss» = mengde 2, maks 3.
        </p>
        {draft.groups.map((g, gi) => (
          <div key={g.key} className="space-y-3 rounded-lg border bg-card/50 p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label="Gruppenavn"
                placeholder="Gruppenavn (valgfritt)"
                value={g.name}
                onChange={(e) => updateGroup(gi, { ...g, name: e.target.value })}
              />
              <Button type="button" variant="ghost" size="sm" disabled={gi === 0}
                aria-label="Flytt gruppen opp" onClick={() => set('groups', swap(draft.groups, gi, gi - 1))}>
                Opp
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={gi === draft.groups.length - 1}
                aria-label="Flytt gruppen ned" onClick={() => set('groups', swap(draft.groups, gi, gi + 1))}>
                Ned
              </Button>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => set('groups', draft.groups.filter((_, i) => i !== gi))}>
                Fjern gruppe
              </Button>
            </div>

            {g.ingredients.map((ing, ii) => (
              <div
                key={ing.key}
                className={`space-y-2 rounded-md border p-2 ${isCorrectedIngredient(ing.name) ? HIGHLIGHT : ''}`}
              >
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 sm:grid-cols-[5rem_5rem_6rem_1fr]">
                  <Input aria-label="Mengde" inputMode="decimal" placeholder="Mengde" value={ing.amount}
                    onChange={(e) => updateIngredient(gi, ii, { amount: e.target.value })} />
                  <Input aria-label="Øvre mengde (ved intervall, f.eks. 2–3)" title="Bare ved intervall: «2–3 ss» = mengde 2, maks 3" inputMode="decimal" placeholder="maks" value={ing.amount_max}
                    onChange={(e) => updateIngredient(gi, ii, { amount_max: e.target.value })} />
                  <Select aria-label="Enhet" value={ing.unit}
                    onChange={(e) => updateIngredient(gi, ii, { unit: e.target.value })}>
                    <option value="">–</option>
                    {CANONICAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Select>
                  <Input aria-label="Navn" placeholder="Navn" className="col-span-3 sm:col-span-1" value={ing.name}
                    onChange={(e) => updateIngredient(gi, ii, { name: e.target.value })} />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="Merknad" placeholder="Merknad (f.eks. finhakket)" value={ing.note}
                    onChange={(e) => updateIngredient(gi, ii, { note: e.target.value })} />
                  <FoodPicker foods={foods} value={ing.food_id} hint={ing.name}
                    onChange={(id) => updateIngredient(gi, ii, { food_id: id })} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={ing.scalable}
                      onChange={(e) => updateIngredient(gi, ii, { scalable: e.target.checked })} />
                    Skaleres
                  </label>
                  {ing.original_text && <span>Original: «{ing.original_text}»</span>}
                  {ing.original_amount != null && (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Omregnet fra {String(ing.original_amount).replace('.', ',')} {ing.original_unit}
                    </span>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" disabled={ii === 0}
                    aria-label="Flytt ingrediensen opp"
                    onClick={() => updateGroup(gi, { ...g, ingredients: swap(g.ingredients, ii, ii - 1) })}>
                    Opp
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7" disabled={ii === g.ingredients.length - 1}
                    aria-label="Flytt ingrediensen ned"
                    onClick={() => updateGroup(gi, { ...g, ingredients: swap(g.ingredients, ii, ii + 1) })}>
                    Ned
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7"
                    onClick={() => updateGroup(gi, { ...g, ingredients: g.ingredients.filter((_, i) => i !== ii) })}>
                    Fjern
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm"
                onClick={() => updateGroup(gi, { ...g, ingredients: [...g.ingredients, emptyIngredient()] })}>
                + Ingrediens
              </Button>
              <Button type="button" variant="outline" size="sm" aria-expanded={pasteGroup === g.key}
                onClick={() => { setPasteGroup(pasteGroup === g.key ? null : g.key); setPasteText('') }}>
                Lim inn flere …
              </Button>
            </div>
            {pasteGroup === g.key && (
              <div className="space-y-2 rounded-md border bg-card p-2">
                <Textarea
                  aria-label="Ingredienser, én per linje"
                  rows={5}
                  autoFocus
                  placeholder={'2 dl melk\n500 g hvetemel\n3 egg'}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" disabled={parseIngredientLines(pasteText).length === 0}
                    onClick={() => addPastedLines(gi)}>
                    Legg til {parseIngredientLines(pasteText).length || ''} ingredienser
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setPasteGroup(null); setPasteText('') }}>
                    Avbryt
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm"
          onClick={() => set('groups', [...draft.groups, { key: newKey(), name: '', ingredients: [emptyIngredient()] }])}>
          + Ingrediensgruppe
        </Button>
      </section>

      <OvenFields rows={draft.oven} onChange={(rows) => set('oven', rows)} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Fremgangsmåte</h2>
        {draft.steps.map((s, si) => (
          <div key={s.key}
            className={`space-y-2 rounded-md border p-2 ${correctedSteps.has(si) ? HIGHLIGHT : ''}`}>
            <div className="flex items-center gap-2">
              <span className="w-6 text-sm text-muted-foreground">{si + 1}.</span>
              <Input aria-label="Delnavn" placeholder="Delnavn (valgfritt)" value={s.group_name}
                onChange={(e) => set('steps', draft.steps.map((x, i) => (i === si ? { ...x, group_name: e.target.value } : x)))} />
            </div>
            <Textarea aria-label={`Steg ${si + 1}`} value={s.text}
              onChange={(e) => set('steps', draft.steps.map((x, i) => (i === si ? { ...x, text: e.target.value } : x)))} />
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={si === 0}
                onClick={() => {
                  const a = [...draft.steps]; [a[si - 1], a[si]] = [a[si], a[si - 1]]; set('steps', a)
                }}>Opp</Button>
              <Button type="button" variant="ghost" size="sm" disabled={si === draft.steps.length - 1}
                onClick={() => {
                  const a = [...draft.steps]; [a[si + 1], a[si]] = [a[si], a[si + 1]]; set('steps', a)
                }}>Ned</Button>
              <Button type="button" variant="ghost" size="sm" className="ml-auto"
                onClick={() => set('steps', draft.steps.filter((_, i) => i !== si))}>Fjern</Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm"
          onClick={() => set('steps', [...draft.steps, { key: newKey(), group_name: '', text: '' }])}>
          + Steg
        </Button>
      </section>

      <section>
        <Field label="Tips (ett per linje)" id="tips">
          <Textarea id="tips" value={draft.tips} onChange={(e) => set('tips', e.target.value)} />
        </Field>
      </section>
    </div>
  )
}
