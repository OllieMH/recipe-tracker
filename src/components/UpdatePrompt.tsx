import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'

const HOUR = 60 * 60 * 1000

/**
 * Registers the service worker and, when a new version of the app has been
 * downloaded in the background, offers to reload into it. Nothing changes under
 * your feet: the old version keeps running until you tap the button.
 */
export default function UpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Check for a new version now and then, for an app that stays open for days.
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), HOUR)
    },
  })

  if (!needRefresh || dismissed) return null

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
        <span className="flex-1">Ny versjon av Kokebok er klar.</span>
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>Last på nytt</Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Senere</Button>
      </div>
    </div>
  )
}
