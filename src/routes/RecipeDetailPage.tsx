import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth, useIsAdmin } from '@/lib/auth'
import { useFoods } from '@/lib/foods'
import { useIsOnline } from '@/lib/offline'
import { copyRecipe } from '@/lib/recipe-draft'
import {
  formatMinutes, useFavorites, useMeasures, useMyCopyOf, useParent, useRecipe, useToggleFavorite,
  type RecipeDetail,
} from '@/lib/recipes'
import { alternatives, type Measures } from '@/lib/conversion'
import { displayIngredient } from '@/lib/ingredient-display'
import { downloadText } from '@/lib/download'
import { useSignedUrls } from '@/lib/images'
import RecipeImage from '@/components/RecipeImage'
import { exportFilename, recipeToMarkdown } from '@/lib/markdown'
import { recipeToPlainText } from '@/lib/plaintext'
import { formatNumber, formatRange, scaleAmount, scaleFactor } from '@/lib/scaling'
import { Button } from '@/components/ui/button'
import CollapsibleSection from '@/components/CollapsibleSection'
import FixWithAi from '@/components/FixWithAi'
import AddToList from '@/components/AddToList'
import { cn } from '@/lib/utils'
import { ChevronLeft, Clock, Download, ExternalLink, Languages, Lock, Minus, Plus, ShoppingBasket, Star, Timer } from 'lucide-react'

type Ingredient = RecipeDetail['ingredient_groups'][number]['ingredients'][number]

function IngredientRow({
  ing, factor, grams, measures,
}: { ing: Ingredient; factor: number; grams: boolean; measures: Measures | undefined }) {
  const [open, setOpen] = useState(false)

  const amount = scaleAmount(ing.amount, ing.unit, factor, ing.scalable)
  const shown = displayIngredient(ing, factor, grams, measures)
  const shownAmount = shown.amount
  const shownMax = shown.amountMax
  const shownUnit = shown.unit

  const alts = amount != null && measures ? alternatives(amount, ing.unit, measures) : []
  const hasDetail = alts.length > 0 || !!ing.original_text || ing.original_amount != null
  const converted = ing.original_amount != null

  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        className={cn('grid w-full grid-cols-[6.5rem_1fr] items-baseline gap-x-3 text-left', hasDetail && 'cursor-pointer')}
        aria-expanded={hasDetail ? open : undefined}
      >
        <span className="text-right font-bold tabular-nums text-berry">
          {formatRange(shownAmount, shownMax)} {shownUnit ?? ''}
        </span>
        <span>
          {ing.name}
          {ing.note ? <span className="text-muted-foreground">, {ing.note}</span> : null}
          {converted && <span className="ml-1 text-xs text-muted-foreground" title="Omregnet fra originalen">*</span>}
        </span>
      </button>
      {open && (
        <div className="ml-[7.25rem] mt-1.5 space-y-0.5 rounded-md bg-secondary/70 p-2 text-sm text-muted-foreground">
          {alts.length > 0 && (
            <p>
              Tilsvarer:{' '}
              {alts.map((a) => `${formatNumber(Math.round(a.amount * 100) / 100)} ${a.unit}`).join(', ')}
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

/** Download / copy / print, grouped so the action bar stays short. */
function ShareMenu({
  onMarkdown, onCopy, copied,
}: { onMarkdown: () => void; onCopy: () => void; copied: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const item = (fn: () => void) => () => {
    fn()
    if (ref.current) ref.current.open = false
  }
  const itemClass = 'block w-full rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent'
  return (
    <details ref={ref} className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-foreground/35 px-3 text-sm font-semibold hover:bg-accent [&::-webkit-details-marker]:hidden">
        <Download className="size-4" aria-hidden />
        Last ned og del
      </summary>
      <div className="absolute left-0 z-10 mt-1 min-w-48 rounded-lg border border-border bg-popover p-1 shadow-sm">
        <button type="button" className={itemClass} onClick={item(onMarkdown)}>Last ned .md</button>
        <button type="button" className={itemClass} onClick={item(onCopy)}>{copied ? 'Kopiert' : 'Kopier tekst'}</button>
        <button type="button" className={itemClass} onClick={item(() => window.print())}>Skriv ut / PDF</button>
      </div>
    </details>
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
  const admin = useIsAdmin(user?.id)
  const foods = useFoods()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useIsOnline()
  const [showFix, setShowFix] = useState(false)
  const [showList, setShowList] = useState(false)
  const [addedTo, setAddedTo] = useState<{ id: string; name: string } | null>(null)
  const [copying, setCopying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [servingsOverride, setServingsOverride] = useState<number | null>(null)
  const [grams, setGrams] = useState(false)
  const [copied, setCopied] = useState(false)
  const notice = (useLocation().state as { notice?: string } | null)?.notice

  const r = recipe.data
  const foodIds = r ? r.ingredient_groups.flatMap((g) => g.ingredients.map((i) => i.food_id)).filter((x): x is number => x != null) : []
  const measures = useMeasures(foodIds)
  const imageUrls = useSignedUrls([r?.image_path])

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
  const servingsChanged = servingsOverride != null && servingsOverride !== baseServings
  const canGrams = foodIds.length > 0

  const isOwner = r.owner_id === user?.id
  const canEdit = isOwner || (!!admin.data && r.visibility === 'public')

  async function makeCopy() {
    setActionError(null)
    setCopying(true)
    try {
      const copyId = await copyRecipe(r!.id)
      await queryClient.invalidateQueries({ queryKey: ['recipes'] })
      navigate(`/oppskrift/${copyId}`)
    } catch {
      setActionError('Kunne ikke lage en kopi. Prøv igjen.')
      setCopying(false)
    }
  }

  function downloadMarkdown() {
    const md = recipeToMarkdown(
      { ...r!, servings: r!.servings != null ? Number(r!.servings) : null },
      { servings, grams, measures: measures.data },
    )
    downloadText(md, exportFilename(r!.title))
  }

  async function copyText() {
    const text = recipeToPlainText(
      { ...r!, servings: r!.servings != null ? Number(r!.servings) : null },
      { servings, grams, measures: measures.data },
    )
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setActionError('Kunne ikke kopiere. Bruk «Last ned .md» i stedet.')
    }
  }

  const staleOriginal = r.parent_id && parent.data && new Date(parent.data.updated_at) > new Date(r.created_at)

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 pb-16 lg:max-w-5xl">
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground print:hidden">
          <ChevronLeft className="size-4" aria-hidden />
          Oppskrifter
        </Link>

        {r.image_path && (
          <RecipeImage
            url={imageUrls.data?.get(r.image_path)}
            alt={r.title}
            className="max-h-[28rem] rounded-xl print:max-h-64"
          />
        )}

        <h1 className="text-3xl font-extrabold leading-[1.1] sm:text-4xl">{r.title}</h1>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {r.total_minutes ? (
            <span className="inline-flex items-center gap-1.5"><Clock className="size-4" aria-hidden />Totalt {formatMinutes(r.total_minutes)}</span>
          ) : null}
          {r.prep_minutes ? (
            <span className="inline-flex items-center gap-1.5"><Timer className="size-4" aria-hidden />Forberedelse {formatMinutes(r.prep_minutes)}</span>
          ) : null}
          {r.visibility === 'private' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Lock className="size-4" aria-hidden />Privat</span>
          )}
          {r.was_translated && (
            <span className="inline-flex items-center gap-1.5"><Languages className="size-4" aria-hidden />Oversatt til norsk</span>
          )}
          {r.source_url && (
            <a href={r.source_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-foreground underline underline-offset-2">
              <ExternalLink className="size-4" aria-hidden />
              {r.source_site ?? r.source_url}
            </a>
          )}
        </div>

        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.tags.map((t) => <span key={t} className="rounded bg-secondary px-2 py-0.5 text-sm">{t}</span>)}
          </div>
        )}

        {r.parent_id && (
          <p className="rounded-lg bg-secondary p-3 text-sm print:hidden">
            Dette er din versjon. <Link to={`/oppskrift/${r.parent_id}`} className="font-semibold underline">Se originalen</Link>.
            {staleOriginal && ' Originalen er endret siden du lagde din versjon.'}
          </p>
        )}
        {!r.parent_id && myCopy.data && (
          <p className="rounded-lg bg-secondary p-3 text-sm print:hidden">
            Du har en egen versjon. <Link to={`/oppskrift/${myCopy.data.id}`} className="font-semibold underline">Åpne din versjon</Link>
          </p>
        )}
        {notice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm print:hidden">{notice}</p>}
        {addedTo && (
          <p role="status" className="rounded-lg bg-secondary p-3 text-sm print:hidden">
            Lagt til i «{addedTo.name}». <Link to={`/handleliste/${addedTo.id}`} className="font-semibold underline">Åpne listen</Link>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant={isFav ? 'default' : 'outline'} size="sm"
            aria-pressed={isFav}
            disabled={toggleFav.isPending}
            onClick={() => toggleFav.mutate({ recipeId: r.id, favorite: !isFav })}
          >
            <Star className={cn(isFav && 'fill-berry text-berry')} aria-hidden />
            {isFav ? 'Favoritt' : 'Legg til i favoritter'}
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/oppskrift/${r.id}/rediger`)}>Rediger</Button>
          )}
          {!isOwner && !r.parent_id && !myCopy.data && (
            <Button variant="outline" size="sm" onClick={makeCopy} disabled={copying}>
              {copying ? 'Lager kopi …' : 'Lag min versjon'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!online}
            title={online ? undefined : 'Krever nett'}
            onClick={() => { setAddedTo(null); setShowList(true) }}
          >
            <ShoppingBasket aria-hidden />
            Legg til i handleliste
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowFix(true)}>Fiks med AI</Button>
          <ShareMenu onMarkdown={downloadMarkdown} onCopy={copyText} copied={copied} />
        </div>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </div>

      {showFix && (
        <FixWithAi
          recipe={r}
          foods={foods.data ?? []}
          canEdit={canEdit}
          myCopyId={myCopy.data?.id ?? null}
          onClose={() => setShowFix(false)}
        />
      )}

      {showList && (
        <AddToList
          recipe={r}
          baseServings={baseServings}
          initialServings={servings}
          servingsUnit={r.servings_unit ?? 'porsjoner'}
          grams={grams}
          measures={measures.data}
          onClose={() => setShowList(false)}
          onAdded={(list) => { setShowList(false); setAddedTo(list) }}
        />
      )}

      {r.description && <p className="prose-recipe text-lg">{r.description}</p>}

      {/* From laptop width: ingredients on the left (they stay in view while you read the steps),
          steps and tips on the right. Below that, and when printing, it is one column in the same order. */}
      <div className="space-y-8 lg:grid lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-10 lg:space-y-0 print:block print:space-y-8">
      <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto print:static print:max-h-none print:overflow-visible">
      <CollapsibleSection
        id="ingredients"
        title="Ingredienser"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {baseServings != null && servings != null && (
              <div className="flex items-center gap-1" role="group" aria-label="Antall porsjoner">
                <div className="flex items-center rounded-lg border border-foreground/35 bg-card">
                  <Button variant="ghost" size="sm" aria-label="Færre porsjoner" className="size-10"
                    disabled={servings <= 1}
                    onClick={() => setServingsOverride(Math.max(1, servings - 1))}>
                    <Minus aria-hidden />
                  </Button>
                  <span className="min-w-28 text-center text-sm font-semibold tabular-nums">
                    {formatNumber(servings)} {r.servings_unit ?? 'porsjoner'}
                  </span>
                  <Button variant="ghost" size="sm" aria-label="Flere porsjoner" className="size-10"
                    onClick={() => setServingsOverride(servings + 1)}>
                    <Plus aria-hidden />
                  </Button>
                </div>
                {/* Always rendered, only hidden, so the stepper doesn't shift when it appears */}
                <Button
                  variant="ghost" size="sm"
                  className={cn(!servingsChanged && 'invisible')}
                  disabled={!servingsChanged}
                  tabIndex={servingsChanged ? 0 : -1}
                  aria-hidden={!servingsChanged}
                  onClick={() => setServingsOverride(null)}
                >
                  Nullstill
                </Button>
              </div>
            )}
            {canGrams && (
              <Button variant="outline" aria-pressed={grams} onClick={() => setGrams(!grams)}>
                {grams ? 'Vis i mål' : 'Vis i gram'}
              </Button>
            )}
          </div>
        }
      >
        {servings != null && (
          <p className="hidden text-sm print:block">
            {formatNumber(servings)} {r.servings_unit ?? 'porsjoner'}{grams ? ', vist i gram' : ''}
          </p>
        )}
        {baseServings == null && (
          <p className="text-sm text-muted-foreground">Antall porsjoner mangler, så mengdene kan ikke skaleres.</p>
        )}

        <div className="rounded-xl border border-foreground/10 bg-card p-4 sm:p-5">
          {r.ingredient_groups.map((g, gi) => (
            <div key={g.id} className={cn(gi > 0 && 'mt-5')}>
              {g.name && <h3 className="mb-1 font-bold">{g.name}</h3>}
              <ul className="divide-y divide-border/70">
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
        </div>
        {r.ingredient_groups.some((g) => g.ingredients.some((i) => i.original_amount != null)) && (
          <p className="text-sm text-muted-foreground">* Omregnet fra amerikanske mål. Trykk på ingrediensen for originalen.</p>
        )}
      </CollapsibleSection>
      </div>

      <div className="space-y-8">
      <CollapsibleSection id="steps" title="Fremgangsmåte">
        <ol className="space-y-6">
          {r.steps.map((s, i) => (
            <li key={s.id}>
              {s.group_name && s.group_name !== r.steps[i - 1]?.group_name && (
                <h3 className="mb-2 font-bold">{s.group_name}</h3>
              )}
              <div className="grid grid-cols-[2.75rem_1fr] items-start gap-x-2">
                <span className="text-3xl font-extrabold leading-none tabular-nums text-berry">{i + 1}</span>
                <p className="prose-recipe text-[1.05rem]">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleSection>

      {r.tips.length > 0 && (
        <CollapsibleSection id="tips" title="Tips">
          <ul className="prose-recipe list-disc space-y-2 rounded-xl bg-secondary/70 p-4 pl-9">
            {r.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </CollapsibleSection>
      )}
      </div>
      </div>
    </main>
  )
}
