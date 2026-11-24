import { formatLineAmount, type MergeSuggestion } from '@/lib/shopping-merge'

interface Props {
  suggestion: MergeSuggestion
  onMerge: (unit: string) => void
  onDismiss: () => void
}

/** Shown inline under the lines it would combine. Nothing happens until a unit is chosen. */
export default function MergePrompt({ suggestion, onMerge, onDismiss }: Props) {
  const parts = suggestion.lines.map((l) => formatLineAmount(l)).join(' + ')
  return (
    <div role="group" aria-label={`Slå sammen ${suggestion.name}`} className="my-1 rounded-lg border border-berry/50 bg-card p-3 text-sm">
      <p>
        <span className="font-semibold">Slå sammen {suggestion.name}?</span>{' '}
        <span className="text-muted-foreground">{parts}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Velg enhet:</span>
        {suggestion.options.slice(0, 6).map((o) => (
          <button
            key={o.unit}
            type="button"
            onClick={() => onMerge(o.unit)}
            className="rounded-md border border-foreground/35 px-2.5 py-1.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {formatLineAmount({ amount: o.amount, amountMax: o.amountMax, unit: o.unit })}
          </button>
        ))}
        <button type="button" onClick={onDismiss} className="px-2 py-1.5 text-muted-foreground underline hover:text-foreground">
          Ikke slå sammen
        </button>
      </div>
    </div>
  )
}
