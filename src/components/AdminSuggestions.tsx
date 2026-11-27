import { useState } from 'react'
import {
  formatDate, KIND_LABELS, STATUS_LABELS, SUGGESTION_STATUSES,
  useAllSuggestions, useAnswerSuggestion, useDeleteSuggestion,
  type SuggestionKind, type SuggestionStatus,
} from '@/lib/suggestions'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type Row = NonNullable<ReturnType<typeof useAllSuggestions>['data']>[number]

function SuggestionRow({ s }: { s: Row }) {
  const answer = useAnswerSuggestion()
  const remove = useDeleteSuggestion()
  const [status, setStatus] = useState(s.status as SuggestionStatus)
  const [reply, setReply] = useState(s.reply ?? '')
  const dirty = status !== s.status || reply.trim() !== (s.reply ?? '')

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{s.display_name || s.email}</span>
        {' · '}{KIND_LABELS[s.kind as SuggestionKind]}{' · '}{formatDate(s.created_at)}
      </p>
      <p className="whitespace-pre-wrap">{s.body}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Select aria-label="Status" className="sm:w-44" value={status}
          onChange={(e) => setStatus(e.target.value as SuggestionStatus)}>
          {SUGGESTION_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
        </Select>
        <Textarea aria-label="Svar (vises for den som sendte)" placeholder="Svar (valgfritt, vises for den som sendte)"
          rows={2} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || answer.isPending}
          onClick={() => answer.mutate({ id: s.id, status, reply })}>
          {answer.isPending ? 'Lagrer …' : 'Lagre'}
        </Button>
        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
          Slett
        </Button>
        {answer.isError && <span className="text-sm text-destructive">Kunne ikke lagre.</span>}
      </div>
    </li>
  )
}

/** Admin: everyone's suggestions, open ones first. */
export default function AdminSuggestions() {
  const all = useAllSuggestions(true)
  const [showClosed, setShowClosed] = useState(false)

  const rows = all.data ?? []
  const open = rows.filter((s) => s.status === 'new' || s.status === 'planned')
  const shown = showClosed ? rows : open

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Forslag ({open.length} åpne)</h2>
        <Button size="sm" variant="outline" aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>
          {showClosed ? 'Vis bare åpne' : `Vis alle (${rows.length})`}
        </Button>
      </div>
      {all.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {all.error && <p className="text-sm text-destructive">Kunne ikke hente forslag.</p>}
      {all.data && shown.length === 0 && <p className="text-sm text-muted-foreground">Ingen forslag her.</p>}
      <ul className="space-y-3">
        {shown.map((s) => <SuggestionRow key={s.id} s={s} />)}
      </ul>
    </section>
  )
}
