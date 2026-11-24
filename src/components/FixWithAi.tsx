import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Food } from '@/lib/foods'
import type { RecipeDetail } from '@/lib/recipes'
import {
  copyRecipe, draftFromLlm, draftFromRecipe, fixRecipe, updateRecipe, type DraftRecipe,
} from '@/lib/recipe-draft'
import { applyChanges, computeChanges, type Change } from '@/lib/recipe-diff'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  recipe: RecipeDetail
  foods: Food[]
  /** Owner, or admin on a public recipe: changes are applied directly. Otherwise a private copy is made. */
  canEdit: boolean
  /** The user's own private copy of this recipe, if one exists. */
  myCopyId: string | null
  onClose: () => void
}

interface Proposal {
  current: DraftRecipe
  changes: Change[]
  corrections: DraftRecipe['corrections']
  warnings: string[]
}

export default function FixWithAi({ recipe, foods, canEdit, myCopyId, onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  async function propose() {
    setError(null)
    if (instruction.trim().length < 3) {
      setError('Beskriv hva som er galt.')
      return
    }
    setBusy(true)
    try {
      const llm = await fixRecipe(recipe.id, instruction.trim())
      const current = draftFromRecipe(recipe)
      const proposed = draftFromLlm(llm, {
        foods, visibility: current.visibility, translated: false, rawText: recipe.import_raw_text ?? '', sourceUrl: current.source_url,
      })
      const changes = computeChanges(current, proposed)
      setProposal({ current, changes, corrections: llm.corrections, warnings: llm.warnings })
      setAccepted(new Set(changes.map((c) => c.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!proposal) return
    const chosen = proposal.changes.filter((c) => accepted.has(c.id))
    if (chosen.length === 0) return
    setError(null)
    setSaving(true)
    try {
      const next = applyChanges(proposal.current, chosen)
      let targetId = recipe.id
      if (!canEdit) targetId = await copyRecipe(recipe.id)
      await updateRecipe(targetId, next)
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      onClose()
      navigate(`/oppskrift/${targetId}`)
    } catch {
      setError('Kunne ikke lagre endringene. Prøv igjen.')
      setSaving(false)
    }
  }

  const toggle = (id: string) =>
    setAccepted((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Fixing someone else's recipe when a private copy already exists would overwrite that copy.
  if (!canEdit && myCopyId) {
    return (
      <Panel onClose={onClose}>
        <p className="text-sm">
          Du har allerede en egen versjon av denne oppskriften.{' '}
          <Link to={`/oppskrift/${myCopyId}`} className="underline">Åpne din versjon</Link> for å bruke «Fiks med AI» der.
        </p>
      </Panel>
    )
  }

  return (
    <Panel onClose={onClose}>
      {!proposal ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Beskriv hva som er galt, for eksempel «steg 3 mangler melet» eller «dette skal være 4 porsjoner».
            Du får se forslaget før noe lagres.
          </p>
          {!canEdit && (
            <p className="rounded bg-muted p-2 text-sm">
              Du eier ikke denne oppskriften. Endringene du godtar lagres i en privat kopi.
            </p>
          )}
          <Label htmlFor="fix-instruction" className="sr-only">Hva er galt?</Label>
          <Textarea id="fix-instruction" rows={3} maxLength={1000} value={instruction}
            onChange={(e) => setInstruction(e.target.value)} placeholder="Hva er galt?" />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Avbryt</Button>
            <Button onClick={propose} disabled={busy}>{busy ? 'Foreslår … (opptil 30 sek)' : 'Foreslå endringer'}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {proposal.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded bg-amber-50 p-2 pl-6 text-sm dark:bg-amber-950/30">
              {proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}

          {proposal.changes.length === 0 ? (
            <p className="text-sm">KI-en fant ingenting å endre ut fra beskrivelsen din.</p>
          ) : (
            <ul className="space-y-3">
              {proposal.changes.map((c) => (
                <li key={c.id} className="rounded-md border p-2">
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={accepted.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1 space-y-1 text-sm">
                      <span className="block font-medium">{c.label}</span>
                      <span className="block whitespace-pre-wrap rounded bg-red-50 px-1.5 py-0.5 text-red-900 line-through dark:bg-red-950/30 dark:text-red-200">
                        {c.before || '(tomt)'}
                      </span>
                      <span className="block whitespace-pre-wrap rounded bg-green-50 px-1.5 py-0.5 text-green-900 dark:bg-green-950/30 dark:text-green-200">
                        {c.after || '(tomt)'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {proposal.corrections.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Begrunnelser fra KI ({proposal.corrections.length})</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {proposal.corrections.map((c, i) => (
                  <li key={i}><span className="text-muted-foreground">{c.field}:</span> {c.reason}</li>
                ))}
              </ul>
            </details>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { setProposal(null); setError(null) }} disabled={saving}>Tilbake</Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>Avbryt</Button>
            {proposal.changes.length > 0 && (
              <Button onClick={apply} disabled={saving || accepted.size === 0}>
                {saving ? 'Lagrer …' : canEdit ? `Bruk ${accepted.size} endring${accepted.size === 1 ? '' : 'er'}` : 'Lag privat kopi med endringene'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Panel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Fiks med AI"
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-t-lg bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:rounded-lg">
        <h2 className="mb-3 text-xl font-bold">Fiks med AI</h2>
        {children}
      </div>
    </div>
  )
}
