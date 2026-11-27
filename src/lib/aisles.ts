// Which store section an item goes in, and in which order the sections are shown.
//
// The section is decided in this order; the first that has an answer wins:
//   1. this list's own choice for the name (moves to and from "Fri for")
//   2. a move someone made, shared with everyone (aisle_overrides)
//   3. word rules on the item's name (below)
//   4. the section Gemini chose for a recipe ingredient on import
//   5. the matched food: hints in its name ("fryst", "hermetisk", fresh herbs), then its
//      Matvaretabellen group via aisle_map
//   6. "Annet"
// Pure, so it can be tested without a database.

import { AISLES, FRI_FOR, type Aisle } from './aisle-list'
import { overrideKey } from './aisle-overrides'

export { AISLES, FRI_FOR, type Aisle }

const isAisle = (s: string | null | undefined): s is Aisle => !!s && (AISLES as readonly string[]).includes(s)

// ---------- word rules ----------

const L = 'a-zæøåéü'
/** Whole words. A trailing * lets a word go on ("glutenfri*" matches "glutenfrie"); a leading * lets it start
 *  with anything ("*mel" matches "hvetemel"). */
function words(...ws: string[]): RegExp {
  const parts = ws.map((w) => {
    const head = w.startsWith('*') ? `[${L}]*` : ''
    const tail = w.endsWith('*') ? `[${L}]*` : ''
    const core = w.replace(/^\*|\*$/g, '').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    return head + core + tail
  })
  return new RegExp(`(?:^|[^${L}])(?:${parts.join('|')})(?=$|[^${L}])`)
}

const HERBS = words(
  'koriander*', 'persille*', 'bladpersille*', 'basilikum*', 'timian*', 'rosmarin*', 'mynte*', 'dill*', 'gressløk*',
  'oregano*', 'estragon*', 'salvie*', 'ingefær*', 'sitrongress*', 'kjørvel*',
)
const DRIED = words('tørket', 'tørkede', 'malt', 'malte', 'knust', 'knuste', '*frø', '*pulver')

/** Ordered: the first rule that matches decides. */
const RULES: [RegExp | ((name: string) => boolean), Aisle][] = [
  // the product itself says it is free of something
  [words('glutenfri*', 'laktosefri*', 'melkefri*', 'eggfri*', 'nøttefri*', 'soyafri*', 'fri for'), 'Fri for'],

  [words(
    'bakepapir', '*folie', 'matpapir', 'frysepose*', 'søppelpose*', 'avfallspose*', 'bærepose*', 'tørkerull', 'kjøkkenrull', 'toalettpapir', 'dopapir',
    'oppvask*', 'zalo', 'vaskemiddel', '*såpe', 'sjampo', 'balsam', 'tannkrem', 'badeolje', 'servietter',
    'stearinlys', 'telys', 'batteri*', 'refill', 'svamp*', 'klut*', 'bleier', 'våtservietter',
  ), 'Husholdning'],

  // herbs and spices: dried or ground in the spice rack, fresh ones with the vegetables
  [(n) => HERBS.test(n) && DRIED.test(n), 'Krydder, olje og saus'],
  [(n) => HERBS.test(n), 'Frukt og grønt'],
  [words('sitronsaft', 'limesaft', 'sitronskall', 'limeskall', 'chili', 'grønn chili', 'rød chili'), 'Frukt og grønt'],
  // fresh yeast sits in the dairy cooler; dry yeast (tørrgjær) is a baking good below
  [words('gjær', 'fersk gjær', 'pressgjær'), 'Meieri og egg'],
  [words('bacon', 'pancetta', 'chorizo'), 'Kjøtt og fisk'],

  [words(
    'kokesjokolade', 'blokksjokolade', 'sjokoladebiter', 'sjokoladeknapper', 'bakepulver', 'natron',
    'hjortetakksalt', 'vaniljesukker', 'vaniljestang', 'vaniljestenger', 'vaniljeekstrakt', 'kakao', 'kakaopulver',
    'melis', 'perlesukker', 'farin', '*sukker', 'sirup', '*mel', 'melmiks', 'tørrgjær', 'maisenna', 'gelatin',
    'marsipan', 'strøssel', 'kokosmasse', 'rosiner', 'tørket frukt', 'mandler', 'hasselnøtter', 'valnøtter',
    'pekannøtter', 'kokosfett', 'kakesmør', 'fiberhusk', 'psyllium*', 'chiafrø', 'linfrø', 'solsikkekjerner',
    'gresskarkjerner',
  ), 'Bakevarer'],

  [words(
    'ketchup', 'sennep', 'majones', 'aioli', 'soyasaus', 'soya', 'sriracha', 'tabasco', 'chilisaus', 'worcestershire*',
    '*eddik', 'balsamico', '*olje', 'salt', 'flaksalt', 'havsalt', 'pepper', 'pepperkorn', 'kanel', 'kanelstang',
    'kardemomme*', 'nellik*', 'muskat*', 'karri', 'gurkemeie', 'spisskummen', 'garam masala', 'chilipulver',
    'chiliflak', 'paprikapulver', 'laurbærblad', 'stjerneanis', 'krydder*', 'fiskesaus', 'østerssaus', 'dressing',
  ), 'Krydder, olje og saus'],

  [words(
    'hermetisk*', 'hakkede tomater', 'tomatpuré', 'tomatpure', 'passata', 'kokosmelk', 'kokosfløte', 'buljong*',
    '*kraft', 'fond', 'taco*', 'tortilla*', 'pasta', 'spagetti', 'spaghetti', 'lasagneplater', 'makaroni',
    'penne', 'nudler', 'eggnudler', 'ris', 'jasminris', 'basmatiris', 'couscous', 'bulgur', 'linser', 'kikerter',
    'bønner', 'kidneybønner', 'pesto', 'karripasta', 'curry paste', 'oliven', 'kapers', 'jalapeño*',
  ), 'Middag og hermetikk'],

  [words(
    'honning', 'syltetøy', '*syltetøy', 'marmelade', 'nugatti', 'peanøttsmør', 'leverpostei', 'makrell i tomat',
    'kaviar', 'havregryn', 'müsli', 'musli', 'granola', 'frokostblanding', 'cornflakes',
  ), 'Pålegg og frokost'],

  [words(
    'brus', 'cola', 'julebrus', 'juice', 'saft', 'kaffe', 'te', 'energidrikk', 'redbull', 'red bull', 'monster',
    'mineralvann', 'farris', 'øl', 'vin', 'cider',
  ), 'Drikke'],

  // not plain "sjokolade": in a recipe it is for baking, on a list it is a snack, so the food decides
  [words('chips', 'potetgull', 'godteri', 'smågodt', 'popcorn', 'lakris', 'kjeks'), 'Snacks og godteri'],

  [words('frossen', 'frosne', 'fryst', 'frosset', 'iskrem', 'pommes frites'), 'Frysevarer'],

  [words('brød', '*brød', 'rundstykke*', 'baguett*', 'ciabatta', 'loff', 'lomper', 'pitabrød', 'naan', 'polarbrød', 'wraps'), 'Brød'],
]

/** The section the name alone points to, or null. */
export function aisleFromName(name: string): Aisle | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  for (const [test, aisle] of RULES) {
    if (typeof test === 'function' ? test(n) : test.test(n)) return aisle
  }
  return null
}

// ---------- the matched food ----------

export interface FoodLike {
  name_no?: string | null
  category: string | null
}

/** Section from a matched food: hints in its name first, then its food group. */
export function aisleFromFood(food: FoodLike | null | undefined, groupMap: ReadonlyMap<string, string> | undefined): Aisle | null {
  if (!food) return null
  const name = (food.name_no ?? '').toLowerCase()
  if (/(^|, )fryst($|,)/.test(name)) return 'Frysevarer'
  if (/hermetisk/.test(name)) return 'Middag og hermetikk'
  // Matvaretabellen keeps fresh herbs ("Dill, rå") with the dried ones
  if (food.category === 'Urter og krydder' && /(^|, )rå($|,)/.test(name)) return 'Frukt og grønt'
  if (food.category === 'Produkter av frukt og bær' && /(^|, )tørket($|,)/.test(name)) return 'Bakevarer'
  const mapped = food.category ? groupMap?.get(food.category) : undefined
  return isAisle(mapped) ? mapped : null
}

// ---------- putting it together ----------

export interface AisleInputs {
  name: string
  food?: FoodLike | null
  /** The section Gemini chose for a recipe ingredient. */
  suggested?: string | null
  groupMap?: ReadonlyMap<string, string>
  /** name_key -> section, shared by everyone */
  shared?: ReadonlyMap<string, string>
  /** name_key -> section, for this list only */
  list?: ReadonlyMap<string, string>
}

/** The section for a new item, without this list's own choices (used to tell whether one is needed). */
export function automaticAisle(i: Omit<AisleInputs, 'list'>): Aisle {
  const key = overrideKey(i.name)
  const shared = i.shared?.get(key)
  if (isAisle(shared)) return shared
  return aisleFromName(i.name) ?? (isAisle(i.suggested) ? i.suggested : null) ?? aisleFromFood(i.food, i.groupMap) ?? 'Annet'
}

export function chooseAisle(i: AisleInputs): Aisle {
  const own = i.list?.get(overrideKey(i.name))
  return isAisle(own) ? own : automaticAisle(i)
}

/**
 * What to remember when someone moves an item from one section to another.
 * Moves to or from "Fri for" depend on the household, so they are kept for the list only;
 * other moves are facts about stores and are shared with everyone.
 */
export type MoveMemory =
  | { scope: 'shared'; aisle: Aisle }
  | { scope: 'list'; aisle: Aisle }
  | { scope: 'list-clear' }

export function rememberMove(from: string, to: Aisle, automatic: Aisle): MoveMemory {
  if (to === FRI_FOR) return { scope: 'list', aisle: to }
  if (from === FRI_FOR) {
    // Out of "Fri for": if it would land in the chosen section by itself, forgetting the list's
    // choice is enough; otherwise remember the new section for this list.
    return automatic === to ? { scope: 'list-clear' } : { scope: 'list', aisle: to }
  }
  return { scope: 'shared', aisle: to }
}

// ---------- order ----------

/**
 * The list's own order, made complete: unknown names are dropped, and sections that are
 * missing (added to the app later) go in at their place in the default order.
 */
export function effectiveOrder(custom: readonly string[] | null | undefined): Aisle[] {
  const own = (custom ?? []).filter(isAisle).filter((a, i, arr) => arr.indexOf(a) === i)
  if (own.length === 0) return [...AISLES]
  const out = [...own]
  AISLES.forEach((a, i) => {
    if (out.includes(a)) return
    // after the nearest section that comes before it by default
    const before = AISLES.slice(0, i).reverse().find((b) => out.includes(b))
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, a)
  })
  return out
}
