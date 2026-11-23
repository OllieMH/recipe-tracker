import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFoods } from '@/lib/foods'
import { supabase } from '@/lib/supabase'
import { alternatives, type Measures } from '@/lib/conversion'
import { parseNumber } from '@/lib/recipe-draft'
import { formatNumber } from '@/lib/scaling'
import FoodPicker from '@/components/FoodPicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

const UNITS = ['g', 'kg', 'ml', 'dl', 'l', 'ts', 'ss', 'krm', 'stk', 'skive', 'fedd', 'neve', 'boks', 'pk', 'bunt']

export default function ConverterPage() {
  const foods = useFoods()
  const [foodId, setFoodId] = useState<number | null>(null)
  const [amountText, setAmountText] = useState('1')
  const [unit, setUnit] = useState('dl')

  const measures = useQuery({
    queryKey: ['measures', 'food', foodId],
    enabled: foodId != null,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('food_measures').select('unit, grams').eq('food_id', foodId!)
      if (error) throw error
      const m: Measures = {}
      for (const row of data) m[row.unit] = Number(row.grams)
      return m
    },
  })

  const food = foodId != null ? foods.data?.find((f) => f.id === foodId) : undefined
  const amount = parseNumber(amountText)
  const results = amount != null && measures.data ? alternatives(amount, unit, measures.data) : []
  const hasMeasures = measures.data && Object.keys(measures.data).length > 0

  return (
    <main className="mx-auto max-w-xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Omregning</h1>
      <p className="text-sm text-muted-foreground">
        Regn mellom mål og vekt for en matvare, for eksempel hvor mange gram én dl mel er.
      </p>

      <div className="space-y-1.5">
        <Label>Matvare</Label>
        <FoodPicker foods={foods.data ?? []} value={foodId} hint="" placeholder="Søk matvare, f.eks. hvetemel" onChange={setFoodId} />
        {food && <p className="text-sm font-medium">{food.name_no}</p>}
      </div>

      <div className="flex gap-3">
        <div className="w-28 space-y-1.5">
          <Label htmlFor="amount">Mengde</Label>
          <Input id="amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
        </div>
        <div className="w-28 space-y-1.5">
          <Label htmlFor="unit">Enhet</Label>
          <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
      </div>

      {foodId == null && <p className="text-sm text-muted-foreground">Velg en matvare for å se omregning.</p>}
      {foodId != null && measures.isSuccess && !hasMeasures && (
        <p className="text-sm text-muted-foreground">Ingen mål er registrert for denne matvaren, så vi kan ikke regne om.</p>
      )}
      {foodId != null && hasMeasures && amount == null && (
        <p className="text-sm text-destructive">Skriv inn et tall.</p>
      )}
      {foodId != null && hasMeasures && amount != null && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Kan ikke regne om fra {unit} for denne matvaren.</p>
      )}
      {results.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm text-muted-foreground">
            {formatNumber(amount!)} {unit} tilsvarer:
          </p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {results.map((r) => (
              <li key={r.unit} className="tabular-nums">
                <span className="font-medium">{formatNumber(Math.round(r.amount * 100) / 100)}</span> {r.unit}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="pt-4 text-xs text-muted-foreground">
        Kilde: Matvaretabellen 2026. Mattilsynet. www.matvaretabellen.no
      </p>
    </main>
  )
}
