import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { useFoods } from '@/lib/foods'
import { useRecipe, type RecipeDetail } from '@/lib/recipes'
import { deleteRecipe, draftFromRecipe, updateRecipe, validateDraft, type DraftRecipe } from '@/lib/recipe-draft'
import RecipeForm from '@/components/RecipeForm'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

function EditForm({ recipe, isOwner }: { recipe: RecipeDetail; isOwner: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const foods = useFoods().data ?? []
  const [draft, setDraft] = useState<DraftRecipe>(() => draftFromRecipe(recipe))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSave() {
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updateRecipe(recipe.id, draft)
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate(`/oppskrift/${recipe.id}`)
    } catch {
      setError('Kunne ikke lagre. Prøv igjen.')
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!window.confirm(`Slette «${recipe.title}»? Dette kan ikke angres.`)) return
    setSaving(true)
    try {
      await deleteRecipe(recipe.id)
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate('/', { replace: true })
    } catch {
      setError('Kunne ikke slette oppskriften.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Rediger oppskrift</h1>
        {isOwner && !recipe.parent_id && (
          <div className="w-40">
            <Label htmlFor="vis" className="sr-only">Synlighet</Label>
            <Select id="vis" value={draft.visibility}
              onChange={(e) => setDraft({ ...draft, visibility: e.target.value as 'public' | 'private' })}>
              <option value="public">Delt</option>
              <option value="private">Privat</option>
            </Select>
          </div>
        )}
      </div>

      <RecipeForm draft={draft} onChange={setDraft} foods={foods} />

      <div className="pt-4">
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>Slett oppskrift</Button>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {error && <p role="alert" className="flex-1 text-sm text-destructive">{error}</p>}
          <Button variant="outline" className="ml-auto" disabled={saving}
            onClick={() => navigate(`/oppskrift/${recipe.id}`)}>
            Avbryt
          </Button>
          <Button disabled={saving} onClick={onSave}>{saving ? 'Lagrer …' : 'Lagre endringer'}</Button>
        </div>
      </div>
    </main>
  )
}

export default function RecipeEditPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const recipe = useRecipe(id)
  const admin = useIsAdmin(user?.id)

  if (recipe.isLoading || admin.isLoading) return <main className="p-4 text-sm text-muted-foreground">Laster …</main>
  const r = recipe.data
  if (!r) {
    return (
      <main className="mx-auto max-w-3xl space-y-2 p-4">
        <p>Fant ikke oppskriften.</p>
        <Link to="/" className="text-sm underline">Til oppskrifter</Link>
      </main>
    )
  }

  const isOwner = r.owner_id === user?.id
  const canEdit = isOwner || (!!admin.data && r.visibility === 'public')
  if (!canEdit) {
    return (
      <main className="mx-auto max-w-3xl space-y-2 p-4">
        <p>Du kan ikke redigere denne oppskriften. Bruk «Lag min versjon» for å lage en egen kopi.</p>
        <Link to={`/oppskrift/${r.id}`} className="text-sm underline">Tilbake til oppskriften</Link>
      </main>
    )
  }

  // key: re-initialise the form if another recipe is opened
  return <EditForm key={r.id} recipe={r} isOwner={isOwner} />
}
