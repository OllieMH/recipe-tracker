import { Timer } from 'lucide-react'
import {
  formatOvenTime, OVEN_MODE_LABELS, OVEN_RACK_LABELS, otherModeHint, type OvenStep,
} from '@/lib/oven'
import { cn } from '@/lib/utils'

/** The oven settings on the recipe page: temperature first and large, readable from across the kitchen. */
export default function OvenCard({ steps }: { steps: OvenStep[] }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-card p-4 sm:p-5">
      <ol className="divide-y divide-border/70">
        {steps.map((s, i) => {
          const time = formatOvenTime(s)
          const hint = otherModeHint(s)
          return (
            <li key={i} className={cn('grid grid-cols-[6.5rem_1fr] items-baseline gap-x-3 py-3', i === 0 && 'pt-0', i === steps.length - 1 && 'pb-0')}>
              <span className="text-right text-2xl font-extrabold tabular-nums text-berry">
                {s.temp_c != null ? `${s.temp_c} °C` : '–'}
              </span>
              <div className="space-y-0.5">
                <p className="font-semibold">
                  {steps.length > 1 && <span className="text-muted-foreground">{i + 1}. </span>}
                  {s.mode ? OVEN_MODE_LABELS[s.mode] : 'Ovnsprogram ikke oppgitt'}
                </p>
                {(time || s.rack) && (
                  <p className="flex flex-wrap items-center gap-x-3 text-sm">
                    {time && (
                      <span className="inline-flex items-center gap-1">
                        <Timer className="size-4" aria-hidden />
                        {time}
                      </span>
                    )}
                    {s.rack && <span>{OVEN_RACK_LABELS[s.rack]}</span>}
                  </p>
                )}
                {s.note && <p className="text-sm">{s.note}</p>}
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
