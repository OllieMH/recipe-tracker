import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export interface Food {
  id: number
  name_no: string
  aliases: string[]
  /** Normalised helpers, precomputed once. */
  _name: string
  _head: string
  _aliases: string[]
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()

const PAGE = 1000 // Supabase returns at most 1000 rows per request

async function fetchFoods(): Promise<Food[]> {
  const all: Food[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('foods')
      .select('id, name_no, aliases')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const f of data) {
      all.push({
        ...f,
        _name: norm(f.name_no),
        _head: norm(f.name_no.split(',')[0]),
        _aliases: f.aliases.map(norm),
      })
    }
    if (data.length < PAGE) break
  }
  return all
}

/** The foods table is small and static: load once, keep forever. */
export function useFoods() {
  return useQuery({ queryKey: ['foods'], queryFn: fetchFoods, staleTime: Infinity })
}

function score(q: string, f: Food): number {
  if (!q) return 0
  if (f._head === q || f._name === q) return 100
  if (f._head.startsWith(q)) return 80
  if (f._aliases.includes(q)) return 75
  if (f._name.startsWith(q)) return 70
  const words = q.split(' ')
  const nameWords = f._name.split(' ')
  if (words.every((w) => nameWords.includes(w))) return 60
  if (f._head.length >= 4 && q.includes(f._head)) return 55
  if (f._name.includes(q)) return 50
  return 0
}

/** Best matches first. Ties go to the shorter (more generic) name. */
export function searchFoods(foods: Food[], query: string, limit = 8): Food[] {
  const q = norm(query)
  if (!q) return []
  return foods
    .map((f) => ({ f, s: score(q, f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.name_no.length - b.f.name_no.length)
    .slice(0, limit)
    .map((x) => x.f)
}

/** Auto-link: returns a food only when the match is strong (head/alias/prefix). */
export function autoMatchFood(foods: Food[], ...queries: (string | null | undefined)[]): Food | null {
  for (const raw of queries) {
    if (!raw) continue
    const q = norm(raw)
    const best = searchFoods(foods, raw, 1)[0]
    if (best && score(q, best) >= 70) return best
  }
  return null
}
