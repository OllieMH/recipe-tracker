import { useMutationState, useQueryClient } from '@tanstack/react-query'
import { useIsOnline } from '@/lib/offline'
import { QUEUED_PREFIX } from '@/lib/shopping-mutations'
import { Button } from '@/components/ui/button'

/** A slim strip under the header: offline, sending waiting changes, or a change that failed. */
export default function OfflineBanner() {
  const online = useIsOnline()
  const qc = useQueryClient()
  const waiting = useMutationState({ filters: { mutationKey: [...QUEUED_PREFIX], status: 'pending' } }).length
  const failed = useMutationState({ filters: { mutationKey: [...QUEUED_PREFIX], status: 'error' } }).length

  function dismissFailed() {
    const cache = qc.getMutationCache()
    for (const m of cache.findAll({ mutationKey: [...QUEUED_PREFIX], status: 'error' })) cache.remove(m)
  }

  let text: string | null = null
  if (failed > 0) text = 'Noen endringer kunne ikke lagres. Last listen på nytt for å se hvordan den ser ut.'
  else if (!online) {
    text = `Du er frakoblet. Endringer lagres og sendes når du er på nett igjen.${waiting > 0 ? ` (${waiting} venter)` : ''}`
  } else if (waiting > 0) text = `Sender ${waiting} ${waiting === 1 ? 'endring' : 'endringer'} …`

  if (!text) return null
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-secondary px-4 py-2 text-center text-sm print:hidden">
      <span>{text}</span>
      {failed > 0 && <Button size="sm" variant="outline" onClick={dismissFailed}>Lukk</Button>}
    </div>
  )
}
