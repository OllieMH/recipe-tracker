// Deterministic portion scaling and display rounding. No LLM involved.

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

/** 1.5 -> "1 ½", 2 -> "2", 2.333 -> "2,33". Norwegian decimal comma. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return ''
  const whole = Math.floor(n + 1e-9)
  const frac = Math.round((n - whole) * 100) / 100
  if (frac === 0) return String(whole)
  if (FRACTIONS[frac]) return whole === 0 ? FRACTIONS[frac] : `${whole} ${FRACTIONS[frac]}`
  if (Math.abs(frac - 1) < 1e-9) return String(whole + 1)
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

const roundTo = (v: number, step: number, min: number) => Math.max(min, Math.round(v / step) * step)

/** Kitchen-friendly rounding by unit (brief section 5). */
export function roundForUnit(value: number, unit: string | null): number {
  if (value <= 0) return 0
  switch (unit) {
    case 'g':
    case 'ml':
      return value >= 100 ? roundTo(value, 5, 5) : roundTo(value, 1, 1)
    case 'kg':
    case 'l':
      return roundTo(value, 0.05, 0.05)
    case 'dl':
      return roundTo(value, 0.25, 0.25)
    default: // ss, ts, krm, stk, fedd, pk, boks, bunt, neve, klype, skive, kvist, no unit
      return roundTo(value, 0.5, 0.5)
  }
}

export function scaleFactor(newServings: number, servings: number | null): number {
  if (!servings || servings <= 0 || !(newServings > 0)) return 1
  return newServings / servings
}

/** Scaled (and rounded) amount. Non-scalable amounts and factor 1 are returned unchanged. */
export function scaleAmount(
  amount: number | null,
  unit: string | null,
  factor: number,
  scalable: boolean,
): number | null {
  if (amount == null) return null
  if (!scalable || Math.abs(factor - 1) < 1e-9) return amount
  return roundForUnit(amount * factor, unit)
}

/** "2–3" style text for an amount range. Empty string when there is no amount. */
export function formatRange(amount: number | null, amountMax: number | null): string {
  if (amount == null) return ''
  return amountMax != null && amountMax > amount
    ? `${formatNumber(amount)}–${formatNumber(amountMax)}`
    : formatNumber(amount)
}
