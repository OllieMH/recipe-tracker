import { useState } from 'react'
import { ArrowRight, Undo2 } from 'lucide-react'
import { useSharedMoves, useUndoSharedMove } from '@/lib/shopping'
import { Button } from '@/components/ui/button'

const PAGE = 20

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Admin: items people moved to another section, newest first. These moves apply to
 * everyone, so a mistaken drag is worth catching. "Angre" removes the shared choice and
 * the item goes back to its automatic section for new items (items already on lists stay).
 */
export default function AdminMoves() {
  const moves = useSharedMoves(true)
  const undo = useUndoSharedMove()
  const [showAll, setShowAll] = useState(false)

  const rows = moves.data ?? []
  const shown = showAll ? rows : rows.slice(0, PAGE)

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Flyttinger ({rows.length})</h2>
        <p className="text-sm text-muted-foreground">
          Varer noen har flyttet til en annen avdeling. Gjelder for alle. «Fri for» velges per liste og vises ikke her.
        </p>
      </div>
      {moves.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {moves.error && <p className="text-sm text-destructive">Kunne ikke hente flyttinger.</p>}
      {moves.data && rows.length === 0 && <p className="text-sm text-muted-foreground">Ingen flyttinger ennå.</p>}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {shown.map((m) => (
          <li key={m.name_key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="min-w-28 font-semibold">{m.name_key}</span>
            <span className="inline-flex flex-1 items-center gap-1.5">
              <span className="text-muted-foreground">{m.previous_aisle ?? 'ukjent'}</span>
              <ArrowRight className="size-3.5 shrink-0" aria-label="til" />
              <span>{m.aisle}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {m.display_name ?? 'ukjent'} · {formatWhen(m.updated_at)}
            </span>
            <Button size="sm" variant="ghost" disabled={undo.isPending} onClick={() => undo.mutate(m.name_key)}>
              <Undo2 aria-hidden /> Angre
            </Button>
          </li>
        ))}
      </ul>
      {rows.length > PAGE && (
        <Button size="sm" variant="outline" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Vis færre' : `Vis alle (${rows.length})`}
        </Button>
      )}
      {undo.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke angre.</p>}
    </section>
  )
}
