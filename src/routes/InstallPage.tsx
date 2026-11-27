import InstallSteps from '@/components/InstallSteps'
import { currentPlatform, isStandalone, type Platform } from '@/lib/install'

const OTHER: Record<Platform, { label: string; platform: Platform }[]> = {
  ios: [{ label: 'Android', platform: 'android' }],
  'ios-webview': [{ label: 'Android', platform: 'android' }],
  android: [{ label: 'iPhone', platform: 'ios' }],
  desktop: [
    { label: 'iPhone', platform: 'ios' },
    { label: 'Android', platform: 'android' },
  ],
}

/** Always-available instructions, linked from the footer. */
export default function InstallPage() {
  const platform = currentPlatform()

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-3xl font-extrabold">Legg Kokebok på Hjem-skjermen</h1>

      {isStandalone() ? (
        <p>Du bruker allerede Kokebok fra Hjem-skjermen. Det er ikke noe mer å gjøre.</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Da får Kokebok et eget ikon, åpnes i fullskjerm og virker også uten nett.
          </p>
          <section className="space-y-2">
            <h2 className="font-semibold">
              {platform === 'android' ? 'Android' : platform === 'desktop' ? 'PC' : 'iPhone og iPad'}
            </h2>
            <InstallSteps platform={platform} />
          </section>
        </>
      )}

      {OTHER[platform].map((o) => (
        <section key={o.label} className="space-y-2">
          <h2 className="font-semibold">{o.label}</h2>
          <InstallSteps platform={o.platform} forOtherDevice />
        </section>
      ))}
    </main>
  )
}
