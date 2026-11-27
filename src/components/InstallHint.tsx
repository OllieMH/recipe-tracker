import { useState } from 'react'
import { X } from 'lucide-react'
import InstallSteps from '@/components/InstallSteps'
import {
  currentPlatform,
  dismissHint,
  isHintDismissed,
  isStandalone,
  useCanPromptInstall,
  useJustInstalled,
} from '@/lib/install'

/**
 * A card on the home page that tells phone users how to put Kokebok on the home
 * screen. Hidden inside the installed app, after it is closed, and on a PC unless
 * the browser offers a one-tap install.
 */
export default function InstallHint() {
  const [dismissed, setDismissed] = useState(isHintDismissed)
  const canPrompt = useCanPromptInstall()
  const justInstalled = useJustInstalled()
  const platform = currentPlatform()

  if (dismissed || justInstalled || isStandalone()) return null
  if (platform === 'desktop' && !canPrompt) return null

  function close() {
    dismissHint()
    setDismissed(true)
  }

  return (
    <section
      aria-labelledby="install-hint-title"
      className="relative rounded-lg border border-border bg-card p-4 pr-10 shadow-sm print:hidden"
    >
      <h2 id="install-hint-title" className="mb-2 font-semibold">
        Legg Kokebok på Hjem-skjermen
      </h2>
      <InstallSteps platform={platform} />
      <button
        type="button"
        onClick={close}
        aria-label="Lukk"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </section>
  )
}
