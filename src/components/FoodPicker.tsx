import { useState } from 'react'
import { searchFoods, type Food } from '@/lib/foods'
import { Input } from '@/components/ui/input'

interface Props {
  foods: Food[]
  value: number | null
  /** Used as the initial search when the user opens the picker. */
  hint: string
  placeholder?: string
  onChange: (id: number | null) => void
}

/** Small combobox: shows the linked food, lets the user search and change or clear it. */
export default function FoodPicker({ foods, value, hint, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = value != null ? foods.find((f) => f.id === value) : undefined
  const results = open ? searchFoods(foods, query || hint, 8) : []

  return (
    <div className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => { setQuery(''); setOpen(true) }}
          className="w-full truncate rounded-md border border-dashed border-input px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
        >
          {current ? `Matvare: ${current.name_no}` : 'Ingen matvare koblet (velg)'}
        </button>
      ) : (
        <div className="absolute z-10 w-full min-w-64 rounded-md border bg-background p-2 shadow-md">
          <Input
            autoFocus
            placeholder={placeholder ?? `Søk matvare (${hint})`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
          <ul className="mt-2 max-h-56 overflow-auto text-sm">
            {results.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => { onChange(f.id); setOpen(false) }}
                >
                  {f.name_no}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-2 py-1.5 text-muted-foreground">Ingen treff</li>}
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-accent"
                onClick={() => { onChange(null); setOpen(false) }}
              >
                Ingen kobling
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-muted-foreground hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                Avbryt
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
