// The store sections of a shopping list, in the default walking order through a
// Norwegian grocery store. Shared by the Edge Functions (Gemini picks one per
// ingredient on import) and the app. The database keeps the same list in
// public.aisles (used to validate input); change both together.

export const AISLES = [
  'Frukt og grønt',
  'Brød',
  'Pålegg og frokost',
  'Kjøtt og fisk',
  'Meieri og egg',
  'Middag og hermetikk',
  'Krydder, olje og saus',
  'Bakevarer',
  'Fri for',
  'Frysevarer',
  'Drikke',
  'Husholdning',
  'Snacks og godteri',
  'Annet',
] as const

export type Aisle = (typeof AISLES)[number]

/** Allergen-free products. Moves to and from this section are remembered per list. */
export const FRI_FOR: Aisle = 'Fri for'
