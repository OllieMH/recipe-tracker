import { OVEN_MODES, OVEN_RACKS } from '@/lib/recipe-schema'
import { OVEN_MODE_LABELS, OVEN_RACK_LABELS } from '@/lib/oven'
import { emptyOven, type DraftOven } from '@/lib/recipe-draft'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface Props {
  rows: DraftOven[]
  onChange: (rows: DraftOven[]) => void
}

/** The "Ovn" part of the recipe form: one row per oven setting. */
export default function OvenFields({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<DraftOven>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Ovn</h2>
        <p className="text-sm text-muted-foreground">
          Hva ovnen skal stå på. La stå tom hvis oppskriften ikke bruker ovn.
        </p>
      </div>
      {rows.map((o, i) => {
        const id = (f: string) => `oven-${o.key}-${f}`
        return (
          <div key={o.key} className="space-y-3 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={id('temp')}>Temperatur (°C)</Label>
                <Input id={id('temp')} inputMode="numeric" value={o.temp_c}
                  onChange={(e) => update(i, { temp_c: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id('mode')}>Varme</Label>
                <Select id={id('mode')} value={o.mode ?? ''}
                  onChange={(e) => update(i, { mode: (e.target.value || null) as DraftOven['mode'] })}>
                  <option value="">Ikke oppgitt</option>
                  {OVEN_MODES.map((m) => <option key={m} value={m}>{OVEN_MODE_LABELS[m]}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id('min')}>Tid (min)</Label>
                <div className="flex items-center gap-1">
                  <Input id={id('min')} inputMode="numeric" value={o.minutes}
                    onChange={(e) => update(i, { minutes: e.target.value })} />
                  <span aria-hidden>–</span>
                  <Input aria-label="Tid, opptil (min)" inputMode="numeric" placeholder="maks" value={o.minutes_max}
                    onChange={(e) => update(i, { minutes_max: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id('rack')}>Plassering</Label>
                <Select id={id('rack')} value={o.rack ?? ''}
                  onChange={(e) => update(i, { rack: (e.target.value || null) as DraftOven['rack'] })}>
                  <option value="">Ikke oppgitt</option>
                  {OVEN_RACKS.map((r) => <option key={r} value={r}>{OVEN_RACK_LABELS[r]}</option>)}
                </Select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor={id('note')}>Merknad (valgfritt)</Label>
                <Input id={id('note')} placeholder="f.eks. forvarm, med lokk" value={o.note}
                  onChange={(e) => update(i, { note: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="sm"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}>Fjern</Button>
            </div>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyOven()])}>
        + Ovnsinnstilling
      </Button>
    </section>
  )
}
