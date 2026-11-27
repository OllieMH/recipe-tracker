import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** The order to start from (complete: every section). */
  initial: readonly string[]
  /** Sections that have open items on the list now, so they can be told apart. */
  inUse: ReadonlySet<string>
  saving: boolean
  onSave: (order: string[]) => void
  onReset: () => void
  onCancel: () => void
}

const move = <T,>(arr: readonly T[], from: number, to: number): T[] => {
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Reorder the store sections of one list. Drag by the handle (mouse or touch), or use
 * the arrows. Nothing is saved until "Lagre".
 */
export default function SectionOrderEditor({ initial, inUse, saving, onSave, onReset, onCancel }: Props) {
  const [order, setOrder] = useState<string[]>([...initial])
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  /** Which row the pointer is over, by the rows' vertical middles. */
  function indexAt(clientY: number): number {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
    const i = rows.findIndex((r) => {
      const b = r.getBoundingClientRect()
      return clientY < b.top + b.height / 2
    })
    return i === -1 ? rows.length - 1 : i
  }

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>, name: string) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(name)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragging) return
    const to = indexAt(e.clientY)
    setOrder((prev) => {
      const from = prev.indexOf(dragging)
      return from === to ? prev : move(prev, from, to)
    })
  }

  const endDrag = () => setDragging(null)

  return (
    <section aria-label="Rekkefølge på avdelinger" className="space-y-3 rounded-lg border border-border bg-card p-3">
      <p className="text-sm text-muted-foreground">
        Dra avdelingene i den rekkefølgen du går gjennom butikken. Gjelder bare denne listen, for alle som deler den.
      </p>
      <ol ref={listRef} className="space-y-1">
        {order.map((name, i) => (
          <li
            key={name}
            data-row
            className={cn(
              'flex items-center gap-2 rounded-md border border-border bg-background px-1 py-1 text-sm',
              dragging === name && 'border-ring shadow-md',
            )}
          >
            <button
              type="button"
              aria-label={`Dra ${name}`}
              className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground active:cursor-grabbing"
              onPointerDown={(e) => onPointerDown(e, name)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <GripVertical className="size-4" />
            </button>
            <span className={cn('flex-1', !inUse.has(name) && 'text-muted-foreground')}>{name}</span>
            <button
              type="button"
              aria-label={`Flytt ${name} opp`}
              disabled={i === 0}
              onClick={() => setOrder(move(order, i, i - 1))}
              className="flex size-9 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Flytt ${name} ned`}
              disabled={i === order.length - 1}
              onClick={() => setOrder(move(order, i, i + 1))}
              className="flex size-9 items-center justify-center rounded hover:bg-accent disabled:opacity-30"
            >
              <ChevronDown className="size-4" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={saving} onClick={() => onSave(order)}>
          {saving ? 'Lagrer …' : 'Lagre'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={saving} onClick={onReset}>
          Tilbakestill
        </Button>
      </div>
    </section>
  )
}
