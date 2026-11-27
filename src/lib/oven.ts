// Oven settings: labels and text, shared by the recipe page, the form and the exports.

import { OvenStepSchema, type OvenStep } from './recipe-schema'
import { z } from 'zod'

export type { OvenStep }

export const OVEN_MODE_LABELS: Record<NonNullable<OvenStep['mode']>, string> = {
  over_under: 'Over- og undervarme',
  varmluft: 'Varmluft',
  overvarme: 'Overvarme',
  undervarme: 'Undervarme',
  grill: 'Grill',
  varmluft_grill: 'Grill med varmluft',
}

export const OVEN_RACK_LABELS: Record<NonNullable<OvenStep['rack']>, string> = {
  nederst: 'Nederst i ovnen',
  midten: 'Midt i ovnen',
  overst: 'Øverst i ovnen',
}

/** The oven column as stored: anything that does not fit the schema is dropped. */
export function parseOven(value: unknown): OvenStep[] {
  const r = z.array(OvenStepSchema).safeParse(value)
  return r.success ? r.data : []
}

export function formatOvenTime(s: Pick<OvenStep, 'minutes' | 'minutes_max'>): string | null {
  if (s.minutes == null) return null
  return s.minutes_max != null && s.minutes_max !== s.minutes ? `${s.minutes}–${s.minutes_max} min` : `${s.minutes} min`
}

/**
 * The same heat on the other kind of oven: fan ovens run about 20 °C cooler than
 * top-and-bottom heat. Only for those two modes.
 */
export function otherModeHint(s: OvenStep): string | null {
  if (s.temp_c == null) return null
  if (s.mode === 'varmluft') return `Uten varmluft: ca. ${s.temp_c + 20} °C over- og undervarme`
  if (s.mode === 'over_under') return `Med varmluft: ca. ${s.temp_c - 20} °C`
  return null
}

/** One line of text, for the Markdown and plain-text exports. */
export function ovenStepText(s: OvenStep): string {
  return [
    s.temp_c != null ? `${s.temp_c} °C` : null,
    s.mode ? OVEN_MODE_LABELS[s.mode].toLowerCase() : null,
    formatOvenTime(s),
    s.rack ? OVEN_RACK_LABELS[s.rack].toLowerCase() : null,
    s.note?.trim() || null,
  ].filter(Boolean).join(', ')
}
