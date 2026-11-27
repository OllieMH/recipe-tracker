import { useState } from 'react'
import { EllipsisVertical, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { promptInstall, useCanPromptInstall, type Platform } from '@/lib/install'

const SITE = 'kokebok.omhille.no'

/**
 * The install instructions for one platform. Used by the home-page hint and /installer.
 * `forOtherDevice` shows the manual steps only, for a platform other than this one.
 */
export default function InstallSteps({
  platform,
  forOtherDevice = false,
}: {
  platform: Platform
  forOtherDevice?: boolean
}) {
  const canPrompt = useCanPromptInstall() && !forOtherDevice
  const [declined, setDeclined] = useState(false)

  if (canPrompt) {
    return (
      <div className="space-y-2">
        <Button
          onClick={() => void promptInstall().then((ok) => setDeclined(!ok))}
        >
          Installer appen
        </Button>
        <p className="text-sm text-muted-foreground">
          Kokebok får et eget ikon og åpnes i fullskjerm, uten adressefelt.
        </p>
      </div>
    )
  }

  if (platform === 'ios-webview') {
    return (
      <p className="text-sm">
        Du ser denne siden inne i en annen app. Åpne <strong>{SITE}</strong> i Safari først, så kan
        du legge den på Hjem-skjermen derfra.
      </p>
    )
  }

  if (platform === 'ios') {
    return (
      <div className="space-y-2 text-sm">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Trykk på Del-knappen <Share className="inline size-4 align-text-bottom" aria-label="Del" />{' '}
            i nettleseren. Ser du den ikke, trykk først på <strong>•••</strong>.
          </li>
          <li>
            Bla ned og velg <strong>Legg til på Hjem-skjerm</strong>.
          </li>
          <li>
            Trykk <strong>Legg til</strong>.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Appen på Hjem-skjermen husker ikke innloggingen fra nettleseren, så du må logge inn én
          gang til første gang du åpner den.
        </p>
      </div>
    )
  }

  if (platform === 'android') {
    return (
      <div className="space-y-2 text-sm">
        {declined && <p>Ombestemt deg? Du kan installere fra menyen i stedet:</p>}
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Trykk på menyen{' '}
            <EllipsisVertical className="inline size-4 align-text-bottom" aria-label="meny" /> øverst
            til høyre i nettleseren.
          </li>
          <li>
            Velg <strong>Installer app</strong> eller <strong>Legg til på startskjermen</strong>.
          </li>
        </ol>
      </div>
    )
  }

  return (
    <p className="text-sm">
      Åpne <strong>{SITE}</strong> på mobilen og følg veiledningen der. I Chrome og Edge på PC kan
      du også installere fra ikonet til høyre i adressefeltet.
    </p>
  )
}
