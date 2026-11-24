import { useMemo, useState } from 'react'
import { Check, Minus, Plus, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  CANONICAL_UNITS,
  conversionOptions,
  formatDecimal,
  formatLineAmount,
  quickSteps,
  stepFor,
  type MeasuresByFood,
  type ShoppingLine,
} from '@/lib/shopping-merge'

interface Props {
  line: ShoppingLine
  measures: MeasuresByFood | undefined
  onToggle: () => void
  onRemove: () => void
  onUndo: () => void
  /** Convert the amount to another unit (3 dl -> 165 g). */
  onConvert: (unit: string) => void
  /** Only change the unit label, keep the number. */
  onSetUnit: (unit: string) => void
  /** Set the total. For a line without an amount, `unit` is the chosen unit. */
  onSetAmount: (amount: number, unit: string | null) => void
}

const chip =
  'rounded-md border border-foreground/35 px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
const stepBtn =
  'flex size-9 shrink-0 items-center justify-center rounded-md border border-foreground/35 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent'

const parseAmount = (s: string): number | null => {
  const n = Number(s.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function ShoppingLineRow({ line, measures, onToggle, onRemove, onUndo, onConvert, onSetUnit, onSetAmount }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingUnit, setPendingUnit] = useState<string | null>(null)

  const options = useMemo(() => conversionOptions(line, measures), [line, measures])
  const amount = formatLineAmount(line)
  const hasAmount = line.amount != null
  const step = stepFor(line.unit)
  // A range ("1–2 dl") has no single number to nudge; use the editor for those.
  const isRange = line.amountMax != null && line.amountMax > (line.amount ?? 0)

  /** The simple − / + on the row: one unit-sized step. A line without an amount starts at 1. */
  function nudge(dir: 1 | -1) {
    if (line.amount == null) {
      if (dir === 1) onSetAmount(1, null)
      return
    }
    onSetAmount(Math.round((line.amount + dir * step) * 100) / 100, line.unit)
  }

  function openEditor() {
    setDraft(line.amount != null ? formatDecimal(line.amount, line.unit) : '')
    setPendingUnit(null)
    setEditing((e) => !e)
  }

  function stepDraft(dir: 1 | -1) {
    const current = parseAmount(draft) ?? 0
    const next = Math.round((current + dir * step) * 100) / 100
    if (next > 0) setDraft(formatDecimal(next, line.unit))
  }

  /** The unit dropdown: "convert:dl" recalculates the amount, "label:dl" only renames the unit. */
  function pickUnit(value: string) {
    const [kind, unit] = value.split(':')
    if (!unit) return
    if (kind === 'convert') onConvert(unit)
    else onSetUnit(unit)
    setEditing(false)
  }

  /** Add a quick amount right away and keep the panel open, so taps can be repeated. */
  function quickAdd(inc: number) {
    const base = parseAmount(draft) ?? line.amount ?? 0
    const next = Math.round((base + inc) * 100) / 100
    setDraft(formatDecimal(next, line.unit))
    onSetAmount(next, line.unit)
  }

  function save() {
    const value = parseAmount(draft)
    if (value == null) return
    if (hasAmount) {
      if (value !== line.amount) onSetAmount(value, line.unit)
    } else {
      onSetAmount(value, pendingUnit)
    }
    setEditing(false)
  }

  return (
    <li className="border-b border-border/60 last:border-0">
      <div className="flex items-center gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={line.checked}
          aria-label={`${line.name}, ${line.checked ? 'avhuket' : 'ikke avhuket'}`}
          onClick={onToggle}
          className="flex size-11 shrink-0 items-center justify-center"
        >
          <span
            className={cn(
              'flex size-6 items-center justify-center rounded-md border-2',
              line.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/40 bg-card',
            )}
          >
            {line.checked && <Check className="size-4" />}
          </span>
        </button>

        {/* The whole text area opens the editor: a big target, easy to hit with a thumb or a mouse. */}
        <button
          type="button"
          onClick={openEditor}
          aria-expanded={editing}
          title="Endre mengde og enhet"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block break-words leading-snug', line.checked && 'text-muted-foreground line-through')}>
              {line.name}
            </span>
            {line.recipes.length > 0 && (
              <span className="block text-xs text-muted-foreground">fra {line.recipes.join(', ')}</span>
            )}
          </span>
          {hasAmount ? (
            <span
              className={cn(
                'shrink-0 whitespace-nowrap font-semibold',
                line.checked ? 'text-muted-foreground line-through' : 'text-berry',
              )}
            >
              {amount}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground underline">mengde</span>
          )}
        </button>

        {!line.checked && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Færre ${line.name}`}
              className={stepBtn}
              disabled={!hasAmount || isRange || (line.amount as number) - step <= 0}
              onClick={() => nudge(-1)}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={`Flere ${line.name}`}
              className={stepBtn}
              disabled={isRange}
              onClick={() => nudge(1)}
            >
              <Plus className="size-4" />
            </button>
          </div>
        )}

        <button
          type="button"
          aria-label={`Fjern ${line.name}`}
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="size-5" />
        </button>
      </div>

      {editing && (
        <div role="group" aria-label={`Endre ${line.name}`} className="space-y-3 pb-3 pl-12 pr-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Mindre" className={stepBtn} onClick={() => stepDraft(-1)}>
              <Minus className="size-4" />
            </button>
            <Input
              aria-label="Mengde"
              inputMode="decimal"
              value={draft}
              autoFocus
              className="w-24 text-center"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
            />
            <button type="button" aria-label="Mer" className={stepBtn} onClick={() => stepDraft(1)}>
              <Plus className="size-4" />
            </button>
            {hasAmount ? (
              // value stays "" so the closed select always shows the current unit
              <Select aria-label="Enhet" className="w-auto min-w-28" value="" onChange={(e) => pickUnit(e.target.value)}>
                <option value="" disabled>{line.unit ?? 'Uten enhet'}</option>
                {options.length > 0 && (
                  <optgroup label="Regn om til">
                    {options.map((o) => (
                      <option key={o.unit} value={`convert:${o.unit}`}>
                        {formatLineAmount({ amount: o.amount, amountMax: o.amountMax, unit: o.unit })}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Bytt enhet, behold tallet">
                  {CANONICAL_UNITS.filter((u) => u !== line.unit).map((u) => (
                    <option key={u} value={`label:${u}`}>{u}</option>
                  ))}
                </optgroup>
              </Select>
            ) : (
              <Select aria-label="Enhet" className="w-auto min-w-28" value={pendingUnit ?? ''} onChange={(e) => setPendingUnit(e.target.value || null)}>
                <option value="">Uten enhet</option>
                {CANONICAL_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            )}
            <Button size="sm" onClick={save} disabled={parseAmount(draft) == null}>Ferdig</Button>
          </div>

          {line.canUndo && (
            <button
              type="button"
              className={cn(chip, 'inline-flex items-center gap-1.5')}
              onClick={() => { onUndo(); setEditing(false) }}
            >
              <Undo2 className="size-4" /> Angre enhetsendring
            </button>
          )}

          {hasAmount && line.unit != null && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Legg til:</span>
              {quickSteps(line.unit).map((inc) => (
                <button
                  key={inc}
                  type="button"
                  aria-label={`Legg til ${formatDecimal(inc, line.unit)} ${line.unit}`}
                  className={chip}
                  onClick={() => quickAdd(inc)}
                >
                  +{formatDecimal(inc, line.unit)} {line.unit}
                </button>
              ))}
            </div>
          )}

        </div>
      )}
    </li>
  )
}
