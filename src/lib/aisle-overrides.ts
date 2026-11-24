// Shared corrections to an item's store section (table aisle_overrides). Everyone
// who adds "sitronsaft" gets the section the last person chose for it. The key is
// the item name, lower case, trimmed, with single spaces; the app builds it, the
// database only stores it.

export const overrideKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100)

/** name_key -> section */
export type AisleOverrides = ReadonlyMap<string, string>

/** The shared section for this name, or null when nobody has corrected it. */
export function overrideFor(overrides: AisleOverrides | undefined, name: string): string | null {
  return overrides?.get(overrideKey(name)) ?? null
}
