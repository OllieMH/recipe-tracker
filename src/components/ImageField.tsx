import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { removeRecipeImage, uploadRecipeImage, useSignedUrls } from '@/lib/images'
import { readClipboardImage, useImagePaste } from '@/lib/clipboard-image'
import { useImageDrop } from '@/lib/drop-image'
import { cn } from '@/lib/utils'
import RecipeImage from '@/components/RecipeImage'
import { Button } from '@/components/ui/button'

interface SavedProps {
  recipeId: string
  /** Current image_path of the recipe. */
  path: string | null
}

/** Picture controls for a saved recipe (edit page). Changes are saved immediately. */
export function SavedImageField({ recipeId, path }: SavedProps) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = useSignedUrls([path])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['recipes'] })
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      await uploadRecipeImage(recipeId, file, path)
      await refresh()
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('Kunne ikke lese') ? err.message : 'Kunne ikke laste opp bildet. Prøv igjen.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  useImagePaste((file) => void onFile(file))
  const drop = useImageDrop((file) => void onFile(file))

  async function pasteFromButton() {
    setError(null)
    try {
      const file = await readClipboardImage()
      if (!file) setError('Fant ikke noe bilde i utklippstavlen.')
      else await onFile(file)
    } catch {
      setError('Fikk ikke tilgang til utklippstavlen. Trykk Ctrl+V (⌘V) på siden i stedet.')
    }
  }

  async function onRemove() {
    if (!path) return
    setError(null)
    setBusy(true)
    try {
      await removeRecipeImage(recipeId, path)
      await refresh()
    } catch {
      setError('Kunne ikke fjerne bildet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div {...drop.props} className={cn('space-y-2 rounded-md p-2 -m-2', drop.dragging && 'bg-accent ring-2 ring-primary')}>
      <h2 className="text-xl font-bold">Bilde</h2>
      <RecipeImage url={path ? urls.data?.get(path) : undefined} alt="" className="max-h-64 rounded-md" />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Laster opp …' : path ? 'Bytt bilde' : 'Velg bilde'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={pasteFromButton}>Lim inn bilde</Button>
        {path && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove}>Fjern bilde</Button>
        )}
        <span className="text-xs text-muted-foreground">
          Du kan også dra et bilde hit eller lime inn med Ctrl+V. Bildet lagres med en gang, uavhengig av «Lagre endringer».
        </span>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

interface PendingProps {
  file: File | null
  onChange: (file: File | null) => void
}

/** Picture chooser for a recipe that is not saved yet (import review). Uploaded after saving. */
export function PendingImageField({ file, onChange }: PendingProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)

  useImagePaste((f) => { setPasteError(null); onChange(f) })
  const drop = useImageDrop(onChange)

  async function pasteFromButton() {
    setPasteError(null)
    try {
      const f = await readClipboardImage()
      if (f) onChange(f)
      else setPasteError('Fant ikke noe bilde i utklippstavlen.')
    } catch {
      setPasteError('Fikk ikke tilgang til utklippstavlen. Trykk Ctrl+V (⌘V) på siden i stedet.')
    }
  }

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div {...drop.props} className={cn('space-y-2 rounded-md p-2 -m-2', drop.dragging && 'bg-accent ring-2 ring-primary')}>
      <h2 className="text-xl font-bold">Bilde (valgfritt)</h2>
      {preview && <img src={preview} alt="" className="max-h-64 w-full rounded-md object-cover" />}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {file ? 'Bytt bilde' : 'Velg bilde'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={pasteFromButton}>Lim inn bilde</Button>
        {file && (
          <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}>
            Fjern
          </Button>
        )}
        <span className="text-xs text-muted-foreground">Du kan også dra et bilde hit eller trykke Ctrl+V (⌘V).</span>
      </div>
      {pasteError && <p role="alert" className="text-sm text-destructive">{pasteError}</p>}
    </div>
  )
}
