import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Food } from '@/lib/foods'
import { saveRecipe, validateDraft, type DraftRecipe } from '@/lib/recipe-draft'
import { uploadRecipeImage } from '@/lib/images'
import RecipeForm from '@/components/RecipeForm'
import { PendingImageField } from '@/components/ImageField'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface Props {
  /** The starting point: an imported recipe, or a blank one. */
  initialDraft: DraftRecipe
  foods: Food[]
  heading?: string
  /** Back to where the recipe was started (nothing has been saved). */
  onCancel: () => void
}

/**
 * Look over, edit and save a new recipe. Every way of starting one (pasted text,
 * photos, writing it yourself) ends here.
 */
export default function RecipeReview({ initialDraft, foods, heading = 'Se over oppskriften', onCancel }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(initialDraft)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Any edit means the problem we complained about may be fixed: stop showing it.
  const edit = (next: DraftRecipe) => {
    setDraft(next)
    setError(null)
  }

  async function onSave() {
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const id = await saveRecipe(draft)
      // The recipe is saved at this point; a failed picture upload must not lose it.
      let notice: string | undefined
      if (imageFile) {
        try {
          await uploadRecipeImage(id, imageFile)
        } catch {
          notice = 'Oppskriften er lagret, men bildet kunne ikke lastes opp. Legg det til under «Rediger».'
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate(`/oppskrift/${id}`, { state: notice ? { notice } : undefined })
    } catch {
      setError('Kunne ikke lagre oppskriften. Prøv igjen.')
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold">{heading}</h1>
        <div className="w-40">
          <Label htmlFor="vis" className="sr-only">Synlighet</Label>
          <Select
            id="vis"
            value={draft.visibility}
            onChange={(e) => edit({ ...draft, visibility: e.target.value as 'public' | 'private' })}
          >
            <option value="public">Delt</option>
            <option value="private">Privat</option>
          </Select>
        </div>
      </div>

      <PendingImageField file={imageFile} onChange={setImageFile} />

      <RecipeForm draft={draft} onChange={edit} foods={foods} />

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {error && <p role="alert" className="flex-1 text-sm text-destructive">{error}</p>}
          <Button type="button" variant="outline" className="ml-auto" disabled={saving} onClick={onCancel}>
            Avbryt
          </Button>
          <Button type="button" disabled={saving} onClick={onSave}>
            {saving ? 'Lagrer …' : 'Lagre oppskrift'}
          </Button>
        </div>
      </div>
    </main>
  )
}
