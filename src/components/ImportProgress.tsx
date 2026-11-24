import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

/** Shown while a recipe is being read: what is happening now, how long it has taken, and a hint when it drags on. */
export default function ImportProgress({ step }: { step: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-md border bg-card/60 p-3">
      <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" aria-hidden />
      <div className="space-y-0.5 text-sm">
        <p className="font-semibold">
          {step} <span className="font-normal text-muted-foreground tabular-nums">{seconds} s</span>
        </p>
        <p className="text-muted-foreground">
          {seconds < 30
            ? 'Det tar vanligvis 10–30 sekunder.'
            : 'Tar litt lenger tid enn vanlig. KI-tjenesten kan være travel. Du får beskjed hvis det ikke går.'}
        </p>
      </div>
    </div>
  )
}
