import { useState, type ClipboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { htmlToText, plainToText } from '@/lib/html-to-text'
import { useFoods } from '@/lib/foods'
import {
  draftFromLlm, importRecipe, saveRecipe, validateDraft, type DraftRecipe,
} from '@/lib/recipe-draft'
import RecipeForm from '@/components/RecipeForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export default function ImportPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const foodsQuery = useFoods()
  const foods = foodsQuery.data ?? []

  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [translate, setTranslate] = useState(true)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRecipe | null>(null)

  // Rich pastes (copied from a web page) arrive as HTML: convert, keep headings and lists.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    if (!html) return
    e.preventDefault()
    const converted = htmlToText(html)
    const el = e.currentTarget
    const next = text.slice(0, el.selectionStart) + converted + text.slice(el.selectionEnd)
    setText(next)
  }

  async function onImport() {
    setError(null)
    const cleaned = plainToText(text)
    if (cleaned.length < 20) {
      setError('Lim inn oppskriften først.')
      return
    }
    setBusy(true)
    try {
      const recipe = await importRecipe(cleaned, translate)
      setDraft(draftFromLlm(recipe, {
        foods, visibility, translated: translate, rawText: cleaned,
        sourceUrl: sourceUrl.trim() || (cleaned.match(/https?:\/\/\S+/)?.[0] ?? ''),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setBusy(false)
    }
  }

  async function onSave() {
    if (!draft) return
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const id = await saveRecipe(draft)
      void queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate(`/oppskrift/${id}`)
    } catch {
      setError('Kunne ikke lagre oppskriften. Prøv igjen.')
      setSaving(false)
    }
  }

  if (draft) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Se over oppskriften</h1>
          <div className="w-40">
            <Label htmlFor="vis" className="sr-only">Synlighet</Label>
            <Select id="vis" value={draft.visibility}
              onChange={(e) => setDraft({ ...draft, visibility: e.target.value as 'public' | 'private' })}>
              <option value="public">Delt</option>
              <option value="private">Privat</option>
            </Select>
          </div>
        </div>

        <RecipeForm draft={draft} onChange={setDraft} foods={foods} />

        <div className="fixed inset-x-0 bottom-0 border-t bg-background p-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            {error && <p role="alert" className="flex-1 text-sm text-destructive">{error}</p>}
            <Button type="button" variant="outline" className="ml-auto" disabled={saving}
              onClick={() => { setDraft(null); setError(null) }}>
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

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Importer oppskrift</h1>
      <p className="text-sm text-muted-foreground">
        Åpne oppskriften på nettsiden, marker hele siden (Ctrl+A), kopier og lim inn her.
        Du får se over alt før det lagres.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="paste">Oppskriftstekst</Label>
        <Textarea id="paste" rows={12} value={text} onPaste={onPaste}
          onChange={(e) => setText(e.target.value)} placeholder="Lim inn her …" />
        <p className="text-xs text-muted-foreground">{text.length.toLocaleString('nb-NO')} tegn</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="url">Kilde-URL (valgfritt)</Label>
        <Input id="url" type="url" placeholder="https://…" value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
          Oversett til norsk
        </label>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="visibility">Synlighet</Label>
          <Select id="visibility" value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
            <option value="public">Delt med alle</option>
            <option value="private">Privat</option>
          </Select>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {foodsQuery.isError && (
        <p className="text-sm text-muted-foreground">Kunne ikke laste matvarelisten. Kobling til matvarer er ikke tilgjengelig.</p>
      )}

      <Button type="button" onClick={onImport} disabled={busy || foodsQuery.isLoading}>
        {busy ? 'Leser oppskriften … (opptil 30 sek)' : 'Importer'}
      </Button>
    </main>
  )
}
