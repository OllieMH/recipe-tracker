import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import {
  formatMinutes, useFavorites, useMeasures, useMyCopyOf, useParent, useRecipe, useToggleFavorite,
  type RecipeDetail,
} from '@/lib/recipes'
import { alternatives, volumeToGrams, type Measures } from '@/lib/conversion'
import { formatNumber, formatRange, roundForUnit, scaleAmount, scaleFactor } from '@/lib/scaling'
import { Button } from '@/components/ui/button'
import CollapsibleSection from '@/components/CollapsibleSection'
import { cn } from '@/lib/utils'

type Ingredient = RecipeDetail['ingredient_groups'][number]['ingredients'][number]

function IngredientRow({
  ing, factor, grams, measures,
}: { ing: Ingredient; factor: number; grams: boolean; measures: Measures | undefined }) {
  const [open, setOpen] = useState(false)

  const amount = scaleAmount(ing.amount, ing.unit, factor, ing.scalable)
  const amountMax = scaleAmount(ing.amount_max, ing.unit, factor, ing.scalable)

  // "Vis i gram": volume amounts become grams when the food has a measure. Otherwise unchanged.
  let shownAmount = amount
  let shownMax = amountMax
  let shownUnit = ing.unit
  if (grams && amount != null && measures) {
    const g = volumeToGrams(amount, ing.unit, measures)
    if (g != null) {
      shownAmount = roundForUnit(g, 'g')
      const gMax = amountMax != null ? volumeToGrams(amountMax, ing.unit, measures) : null
      shownMax = gMax != null ? roundForUnit(gMax, 'g') : null
      shownUnit = 'g'
    }
  }

  const alts = amount != null && measures ? alternatives(amount, ing.unit, measures) : []
  const hasDetail = alts.length > 0 || !!ing.original_text || ing.original_amount != null
  const converted = ing.original_amount != null

  return (
    <li className="py-1.5">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={cn('w-full text-left', hasDetail && 'cursor-pointer')}
        aria-expanded={hasDetail ? open : undefined}
      >
        <span className="font-medium tabular-nums">
          {formatRange(shownAmount, shownMax)} {shownUnit ?? ''}
        </span>{' '}
        {ing.name}
        {ing.note ? <span className="text-muted-foreground">, {ing.note}</span> : null}
        {converted && <span className="ml-1 text-xs text-muted-foreground" title="Omregnet fra originalen">*</span>}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 rounded bg-muted/50 p-2 text-xs text-muted-foreground">
          {alts.length > 0 && (
            <p>
              Tilsvarer:{' '}
              {alts.map((a) => `${formatNumber(Math.round(a.amount * 100) / 100)} ${a.unit}`).join(' · ')}
            </p>
          )}
          {converted && (
            <p>
              Omregnet fra {formatNumber(ing.original_amount!)} {ing.original_unit}
            </p>
          )}
          {ing.original_text && <p>Original: «{ing.original_text}»</p>}
        </div>
      )}
    </li>
  )
}

export default function RecipeDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const recipe = useRecipe(id)
  const favorites = useFavorites(user?.id)
  const toggleFav = useToggleFavorite(user?.id)
  const myCopy = useMyCopyOf(id, user?.id)
  const parent = useParent(recipe.data?.parent_id)

  const [servingsOverride, setServingsOverride] = useState<number | null>(null)
  const [grams, setGrams] = useState(false)

  const r = recipe.data
  const foodIds = r ? r.ingredient_groups.flatMap((g) => g.ingredients.map((i) => i.food_id)).filter((x): x is number => x != null) : []
  const measures = useMeasures(foodIds)

  if (recipe.isLoading) return <main className="p-4 text-sm text-muted-foreground">Laster …</main>
  if (recipe.isError) return <main className="p-4 text-sm text-destructive">Kunne ikke hente oppskriften.</main>
  if (!r) {
    return (
      <main className="mx-auto max-w-3xl space-y-2 p-4">
        <p>Fant ikke oppskriften.</p>
        <Link to="/" className="text-sm underline">Til oppskrifter</Link>
      </main>
    )
  }

  const baseServings = r.servings != null ? Number(r.servings) : null
  const servings = servingsOverride ?? baseServings
  const factor = scaleFactor(servings ?? 0, baseServings)
  const isFav = favorites.data?.has(r.id) ?? false
  const canGrams = foodIds.length > 0

  const staleOriginal = r.parent_id && parent.data && new Date(parent.data.updated_at) > new Date(r.created_at)

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16">
      <div className="space-y-2">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">← Oppskrifter</Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold leading-tight">{r.title}</h1>
          <Button
            variant="outline" size="sm"
            aria-pressed={isFav}
            disabled={toggleFav.isPending}
            onClick={() => toggleFav.mutate({ recipeId: r.id, favorite: !isFav })}
          >
            {isFav ? '★ Favoritt' : '☆ Favoritt'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            r.visibility === 'private' ? 'Privat' : null,
            r.total_minutes ? `Totalt ${formatMinutes(r.total_minutes)}` : null,
            r.prep_minutes ? `Forberedelse ${formatMinutes(r.prep_minutes)}` : null,
            r.was_translated ? 'Oversatt til norsk' : null,
          ].filter(Boolean).join(' · ')}
        </p>
        {r.source_url && (
          <p className="text-sm">
            Kilde:{' '}
            <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              {r.source_site ?? r.source_url}
            </a>
          </p>
        )}
        {r.tags.length > 0 && <p className="text-xs text-muted-foreground">{r.tags.join(', ')}</p>}

        {r.parent_id && (
          <p className="rounded-md bg-muted p-2 text-sm">
            Dette er din versjon. <Link to={`/oppskrift/${r.parent_id}`} className="underline">Se originalen</Link>
            {staleOriginal && ' · Originalen er endret siden du lagde din versjon.'}
          </p>
        )}
        {!r.parent_id && myCopy.data && (
          <p className="rounded-md bg-muted p-2 text-sm">
            Du har en egen versjon. <Link to={`/oppskrift/${myCopy.data.id}`} className="underline">Åpne din versjon</Link>
          </p>
        )}
      </div>

      {r.description && <p className="text-muted-foreground">{r.description}</p>}

      <CollapsibleSection
        id="ingredients"
        title="Ingredienser"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {baseServings != null && servings != null && (
              <div className="flex items-center gap-1" role="group" aria-label="Antall porsjoner">
                <Button variant="outline" size="sm" aria-label="Færre"
                  disabled={servings <= 1}
                  onClick={() => setServingsOverride(Math.max(1, servings - 1))}>−</Button>
                <span className="min-w-24 text-center text-sm tabular-nums">
                  {formatNumber(servings)} {r.servings_unit ?? 'porsjoner'}
                </span>
                <Button variant="outline" size="sm" aria-label="Flere"
                  onClick={() => setServingsOverride(servings + 1)}>+</Button>
                {servingsOverride != null && servingsOverride !== baseServings && (
                  <Button variant="ghost" size="sm" onClick={() => setServingsOverride(null)}>Nullstill</Button>
                )}
              </div>
            )}
            {canGrams && (
              <Button variant="outline" size="sm" aria-pressed={grams} onClick={() => setGrams(!grams)}>
                {grams ? 'Vis i mål' : 'Vis i gram'}
              </Button>
            )}
          </div>
        }
      >
        {baseServings == null && (
          <p className="text-sm text-muted-foreground">Antall porsjoner mangler, så mengdene kan ikke skaleres.</p>
        )}

        {r.ingredient_groups.map((g) => (
          <div key={g.id}>
            {g.name && <h3 className="mt-3 font-medium">{g.name}</h3>}
            <ul className="divide-y">
              {g.ingredients.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  ing={ing}
                  factor={factor}
                  grams={grams}
                  measures={ing.food_id != null ? measures.data?.get(ing.food_id) : undefined}
                />
              ))}
            </ul>
          </div>
        ))}
        {r.ingredient_groups.some((g) => g.ingredients.some((i) => i.original_amount != null)) && (
          <p className="text-xs text-muted-foreground">* Omregnet fra amerikanske mål. Trykk på ingrediensen for originalen.</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="steps" title="Fremgangsmåte">
        <ol className="space-y-3">
          {r.steps.map((s, i) => (
            <li key={s.id}>
              {s.group_name && s.group_name !== r.steps[i - 1]?.group_name && (
                <h3 className="mb-1 font-medium">{s.group_name}</h3>
              )}
              <div className="flex gap-3">
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {r.tips.length > 0 && (
        <CollapsibleSection id="tips" title="Tips">
          <ul className="list-disc space-y-1 pl-5">
            {r.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </CollapsibleSection>
      )}
    </main>
  )
}
