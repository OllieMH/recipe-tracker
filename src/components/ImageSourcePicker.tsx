import { useEffect, useMemo, useRef } from 'react'
import { useImagesDrop } from '@/lib/drop-image'
import { useImagePaste } from '@/lib/clipboard-image'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const MAX_SOURCE_IMAGES = 10

interface Props {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

/** Photos or screenshots of a recipe, in page order. Camera or gallery on a phone, drop or paste on a computer. */
export default function ImageSourcePicker({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const add = (added: File[]) => {
    if (disabled) return
    onChange([...files, ...added].slice(0, MAX_SOURCE_IMAGES))
  }
  useImagePaste((f) => add([f]))
  const drop = useImagesDrop(add)

  const swap = (i: number, j: number) => {
    const next = [...files]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const full = files.length >= MAX_SOURCE_IMAGES

  return (
    <div {...drop.props} className={cn('space-y-3 rounded-md p-2 -m-2', drop.dragging && 'bg-accent ring-2 ring-primary')}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = '' }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || full} onClick={() => inputRef.current?.click()}>
          {files.length === 0 ? 'Velg eller ta bilde' : 'Legg til flere bilder'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Opptil {MAX_SOURCE_IMAGES} bilder. Du kan også dra bilder hit eller lime inn med Ctrl+V (⌘V).
        </span>
      </div>

      {files.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="flex gap-3 rounded-md border bg-card/50 p-2">
              <img src={previews[i]} alt={`Bilde ${i + 1}`} className="size-24 shrink-0 rounded object-cover" />
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <p className="text-sm font-semibold">Bilde {i + 1}</p>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={disabled || i === 0}
                    aria-label={`Flytt bilde ${i + 1} opp`} onClick={() => swap(i - 1, i)}>Opp</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={disabled || i === files.length - 1}
                    aria-label={`Flytt bilde ${i + 1} ned`} onClick={() => swap(i, i + 1)}>Ned</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={disabled}
                    aria-label={`Fjern bilde ${i + 1}`} onClick={() => onChange(files.filter((_, k) => k !== i))}>Fjern</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {files.length > 1 && (
        <p className="text-xs text-muted-foreground">Bildene leses i denne rekkefølgen, som sider i én oppskrift.</p>
      )}
    </div>
  )
}
