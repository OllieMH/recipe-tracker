// Parses what someone types into the "add item" box: "melk", "2 egg", "2 dl melk",
// "500g hakket kjøtt". Pure; the caller links the name to a food and aisle.

const UNIT_WORDS: Record<string, string> = {
  kg: 'kg', g: 'g', gram: 'g',
  l: 'l', liter: 'l', dl: 'dl', ml: 'ml',
  krm: 'krm', ts: 'ts', teskje: 'ts', ss: 'ss', spiseskje: 'ss',
  stk: 'stk', stykk: 'stk',
  fedd: 'fedd', pk: 'pk', pakke: 'pk', boks: 'boks', bunt: 'bunt',
  neve: 'neve', klype: 'klype', skive: 'skive', kvist: 'kvist',
}

// Longest words first so "gram" is tried before "g". A unit only counts when
// followed by whitespace, so "2 løk" is two onions, not 2 litres of "øk". Without a
// unit the name must be separated by whitespace, so "7up" stays a name.
const UNIT_ALT = Object.keys(UNIT_WORDS).sort((a, b) => b.length - a.length).join('|')
const PATTERN = new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s*(${UNIT_ALT})(?=\\s)\\s*|\\s+)(.+)$`, 'i')

export interface QuickAdd {
  name: string
  amount: number | null
  unit: string | null
}

export function parseQuickAdd(input: string): QuickAdd | null {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) return null

  const m = PATTERN.exec(text)
  if (m && m[3].trim()) {
    const amount = Number(m[1].replace(',', '.'))
    if (Number.isFinite(amount) && amount > 0) {
      return {
        name: m[3].trim().slice(0, 200),
        amount,
        unit: m[2] ? UNIT_WORDS[m[2].toLowerCase()] : null,
      }
    }
  }
  return { name: text.slice(0, 200), amount: null, unit: null }
}
