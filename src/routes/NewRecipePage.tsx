import { useState, type ClipboardEvent } from 'react'
import { htmlToText, plainToText } from '@/lib/html-to-text'
import { useFoods } from '@/lib/foods'
import { draftFromLlm, emptyDraft, importRecipe, importRecipeFromImages, type DraftRecipe } from '@/lib/recipe-draft'
import { prepareForAi } from '@/lib/images'
import RecipeReview from '@/components/RecipeReview'
import ImageSourcePicker from '@/components/ImageSourcePicker'
import ImportProgress from '@/components/ImportProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Mode = 'tekst' | 'bilde' | 'manuell'
const MODES: { id: Mode; label: string }[] = [
  { id: 'tekst', label: 'Lim inn tekst' },
  { id: 'bilde', label: 'Fra bilde' },
  { id: 'manuell', label: 'Skriv selv' },
]

type Visibility = 'public' | 'private'

/** Start a new recipe: paste text from a page, or write it yourself. Both end in the review form. */
export default function NewRecipePage() {
  const foodsQuery = useFoods()
  const foods = foodsQuery.data ?? []

  const [mode, setMode] = useState<Mode>('tekst')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<{ draft: DraftRecipe; heading: string } | null>(null)

  // paste mode
  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [translate, setTranslate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('Leser oppskriften …')
  // photo mode
  const [photos, setPhotos] = useState<File[]>([])

  // Rich pastes (copied from a web page) arrive as HTML: convert, keep headings and lists.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData('text/html')
    if (!html) return
    e.preventDefault()
    const converted = htmlToText(html)
    const el = e.currentTarget
    setText(text.slice(0, el.selectionStart) + converted + text.slice(el.selectionEnd))
  }

  async function onImport() {
    setError(null)
    const cleaned = plainToText(text)
    if (cleaned.length < 20) {
      setError('Lim inn oppskriften først.')
      return
    }
    setStep('Leser oppskriften …')
    setBusy(true)
    try {
      const recipe = await importRecipe(cleaned, translate)
      setReview({
        heading: 'Se over oppskriften',
        draft: draftFromLlm(recipe, {
          foods, visibility, translated: translate, rawText: cleaned,
          sourceUrl: sourceUrl.trim() || (cleaned.match(/https?:\/\/\S+/)?.[0] ?? ''),
        }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setBusy(false)
    }
  }

  async function onImportImages() {
    setError(null)
    if (photos.length === 0) {
      setError('Velg minst ett bilde først.')
      return
    }
    setStep('Gjør bildene klare …')
    setBusy(true)
    try {
      const prepared = await Promise.all(photos.map(prepareForAi))
      setStep('Leser oppskriften fra bildene …')
      const recipe = await importRecipeFromImages(prepared, translate)
      setReview({
        heading: 'Se over oppskriften',
        draft: draftFromLlm(recipe, {
          foods, visibility, translated: translate, rawText: null, sourceUrl: sourceUrl.trim(),
        }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt.')
    } finally {
      setBusy(false)
    }
  }

  if (review) {
    return (
      <RecipeReview
        initialDraft={review.draft}
        heading={review.heading}
        foods={foods}
        onCancel={() => { setReview(null); setError(null) }}
      />
    )
  }

  const visibilityField = (
    <div className="w-44 space-y-1.5">
      <Label htmlFor="visibility">Synlighet</Label>
      <Select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
        <option value="public">Delt med alle</option>
        <option value="private">Privat</option>
      </Select>
    </div>
  )

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <h1 className="text-3xl font-extrabold">Ny oppskrift</h1>

      <div role="tablist" aria-label="Hvordan vil du lage oppskriften?" className="flex gap-5 border-b border-foreground/20">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            aria-selected={mode === m.id}
            onClick={() => { setMode(m.id); setError(null) }}
            className={cn(
              '-mb-px border-b-[3px] py-2 text-base font-semibold transition-colors',
              mode === m.id ? 'border-berry text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'tekst' && (
        <div className="space-y-5">
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
            {visibilityField}
          </div>

          {busy && <ImportProgress step={step} />}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {foodsQuery.isError && (
            <p className="text-sm text-muted-foreground">Kunne ikke laste matvarelisten. Kobling til matvarer er ikke tilgjengelig.</p>
          )}

          <Button type="button" onClick={onImport} disabled={busy || foodsQuery.isLoading}>
            Importer
          </Button>
        </div>
      )}

      {mode === 'bilde' && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Ta bilde av en oppskrift i en kokebok eller et blad, eller bruk skjermbilder fra nettet eller sosiale medier.
            Ta hele siden rett ovenfra, med godt lys. Du får se over alt før det lagres.
          </p>

          <ImageSourcePicker files={photos} onChange={(f) => { setPhotos(f); setError(null) }} disabled={busy} />

          <div className="space-y-1.5">
            <Label htmlFor="photo-url">Kilde-URL (valgfritt)</Label>
            <Input id="photo-url" type="url" placeholder="https://…" value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)} />
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
              Oversett til norsk
            </label>
            {visibilityField}
          </div>

          {busy && <ImportProgress step={step} />}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <Button type="button" onClick={onImportImages} disabled={busy || foodsQuery.isLoading}>
            Les oppskriften
          </Button>
        </div>
      )}

      {mode === 'manuell' && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Skriv oppskriften selv. Du kan legge inn flere ingredienser på én gang, én per linje, for eksempel «2 dl melk».
          </p>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">{visibilityField}</div>
          <Button
            type="button"
            onClick={() => setReview({ heading: 'Ny oppskrift', draft: emptyDraft(visibility) })}
            disabled={foodsQuery.isLoading}
          >
            Start med tom oppskrift
          </Button>
        </div>
      )}
    </main>
  )
}
