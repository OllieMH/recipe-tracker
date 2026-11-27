import { useState, type FormEvent } from 'react'
import { useAuth } from '@/lib/auth'
import {
  formatDate, KIND_LABELS, MAX_BODY, STATUS_LABELS, SUGGESTION_KINDS,
  useDeleteSuggestion, useMySuggestions, useSendSuggestion,
  type SuggestionKind, type SuggestionStatus,
} from '@/lib/suggestions'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  new: 'bg-secondary text-secondary-foreground',
  planned: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  declined: 'bg-muted text-muted-foreground',
}

/** "Forslag": send an idea or a problem, and see what happened to the ones you sent. */
export default function SuggestionsPage() {
  const { user } = useAuth()
  const mine = useMySuggestions(user?.id)
  const send = useSendSuggestion()
  const remove = useDeleteSuggestion()

  const [kind, setKind] = useState<SuggestionKind>('idea')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSent(false)
    const text = body.trim()
    if (text.length < 3) return setError('Skriv litt mer, så vi skjønner hva du mener.')
    send.mutate(
      { kind, body: text },
      {
        onSuccess: () => {
          setBody('')
          setSent(true)
        },
        onError: () => setError('Kunne ikke sende. Prøv igjen.'),
      },
    )
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-4">
      <section className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold">Forslag til appen</h1>
          <p className="text-muted-foreground">
            Savner du noe, eller er det noe som ikke virker? Skriv det her.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Hva gjelder det?</legend>
            <div className="flex flex-wrap gap-2">
              {SUGGESTION_KINDS.map((k) => (
                <Button key={k} type="button" size="sm" variant={kind === k ? 'default' : 'outline'}
                  aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {KIND_LABELS[k]}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="suggestion-body">
              {kind === 'problem' ? 'Hva skjedde, og hva forventet du?' : 'Forslaget ditt'}
            </Label>
            <Textarea id="suggestion-body" rows={5} maxLength={MAX_BODY} value={body}
              onChange={(e) => { setBody(e.target.value); setSent(false) }} />
            {body.length > MAX_BODY - 200 && (
              <p className="text-right text-xs text-muted-foreground">{body.length} / {MAX_BODY}</p>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {sent && <p role="status" className="text-sm">Takk! Forslaget er sendt.</p>}
          <Button type="submit" disabled={send.isPending}>
            {send.isPending ? 'Sender …' : 'Send'}
          </Button>
        </form>
      </section>

      {mine.data && mine.data.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Dine forslag</h2>
          <ul className="space-y-3">
            {mine.data.map((s) => {
              const status = s.status as SuggestionStatus
              return (
                <li key={s.id} className="space-y-2 rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_STYLE[status])}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="text-muted-foreground">
                      {KIND_LABELS[s.kind as SuggestionKind]} · {formatDate(s.created_at)}
                    </span>
                    {status === 'new' && (
                      <Button variant="ghost" size="sm" className="ml-auto"
                        disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                        Trekk tilbake
                      </Button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{s.body}</p>
                  {s.reply && (
                    <p className="whitespace-pre-wrap rounded-md bg-secondary/70 p-3 text-sm">
                      <span className="font-semibold">Svar: </span>{s.reply}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
