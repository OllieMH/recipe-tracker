import { useSyncExternalStore } from 'react'

/**
 * Helping people put Kokebok on their phone's home screen.
 *
 * Android (Chrome, Edge, Samsung Internet) fires `beforeinstallprompt`, which we keep
 * so a button can open the system install dialog. iPhone has no such event: there the
 * only way is Safari's Share menu, so we show the steps instead.
 */

export type Platform =
  | 'ios' // iPhone/iPad in Safari or a browser that offers Share → Add to Home Screen
  | 'ios-webview' // iPhone/iPad inside another app's browser (Facebook, Google app, …)
  | 'android'
  | 'desktop'

/** Decides from the user agent (and touch points, since iPadOS claims to be a Mac). */
export function detectPlatform(ua: string, maxTouchPoints = 0): Platform {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  if (ios) {
    // Safari, Chrome, Firefox and Edge on iOS all have Share → «Legg til på Hjem-skjerm».
    // Apps that show links in their own view (no "Safari" token, or a known app tag) do not.
    const inApp = /FBAN|FBAV|Instagram|GSA\/|Line\/|Snapchat|LinkedInApp|Twitter/.test(ua)
    const browser = /Safari\//.test(ua) || /CriOS|FxiOS|EdgiOS/.test(ua)
    return inApp || !browser ? 'ios-webview' : 'ios'
  }
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** True when running as the installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function currentPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
}

// --- The deferred install prompt -------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Starts listening. Called once at startup, because the browser may fire the event
 * before any React component has mounted.
 */
export function initInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button instead of the browser's mini-bar
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whether a one-tap install is available right now (Android/desktop Chromium). */
export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false)
}

/** True once the app was installed during this visit. */
export function useJustInstalled(): boolean {
  return useSyncExternalStore(subscribe, () => installed, () => false)
}

/** Opens the system install dialog. Resolves true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  // A prompt event can only be used once.
  deferred = null
  notify()
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

// --- Remembering that the hint was dismissed -------------------------------------

const DISMISS_KEY = 'install-hint-dismissed'

export function isHintDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissHint() {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // private mode or blocked storage: the hint just comes back next time
  }
}
