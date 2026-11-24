import { useState, type FormEvent } from 'react'
import { Users } from 'lucide-react'
import { useLeaveList, useListMembers, useRemoveMember, useShareList } from '@/lib/shopping'
import { useIsOnline } from '@/lib/offline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  listId: string
  isOwner: boolean
  userId: string | undefined
  /** Called after you leave, so the page can move away from a list you can no longer see. */
  onLeft: () => void
}

function shareError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code
  if (code === 'P0002') return 'Fant ingen bruker med den e-postadressen. Personen må være invitert til Kokebok først.'
  if (code === '42501') return 'Bare eieren kan dele listen.'
  return 'Kunne ikke dele listen. Prøv igjen.'
}

export default function ShareListPanel({ listId, isOwner, userId, onLeft }: Props) {
  const members = useListMembers(listId)
  const share = useShareList(listId)
  const remove = useRemoveMember(listId)
  const leave = useLeaveList(listId)
  const online = useIsOnline()
  const [email, setEmail] = useState('')
  const [sharedWith, setSharedWith] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const list = members.data ?? []

  function onShare(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setSharedWith(null)
    share.mutate(value, {
      onSuccess: () => {
        setSharedWith(value)
        setEmail('')
      },
    })
  }

  return (
    <details className="rounded-lg border border-border bg-card text-sm">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">
          {list.length > 1 ? `Delt med ${list.length - 1} ${list.length === 2 ? 'annen' : 'andre'}` : 'Del listen'}
        </span>
      </summary>

      <div className="space-y-3 border-t border-border/60 px-3 py-3">
        {members.isError && <p role="alert" className="text-destructive">Kunne ikke hente medlemmene.</p>}

        <ul className="divide-y divide-border/60">
          {list.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">
                {m.label}
                {m.user_id === userId && <span className="text-muted-foreground"> (deg)</span>}
                {m.is_owner && <span className="text-muted-foreground"> · eier</span>}
              </span>
              {isOwner && !m.is_owner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={!online || remove.isPending}
                  aria-label={`Fjern ${m.label} fra listen`}
                  onClick={() => remove.mutate(m.user_id)}
                >
                  Fjern
                </Button>
              )}
            </li>
          ))}
        </ul>
        {remove.isError && <p role="alert" className="text-destructive">Kunne ikke fjerne medlemmet.</p>}

        {isOwner && (
          <form onSubmit={onShare} className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                aria-label="E-postadresse å dele med"
                placeholder="E-post til en som har tilgang til Kokebok"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" disabled={!online || share.isPending || !email.trim()} title={online ? undefined : 'Krever nett'}>
                Del
              </Button>
            </div>
            {share.isError && <p role="alert" className="text-destructive">{shareError(share.error)}</p>}
            {sharedWith && <p role="status" className="text-muted-foreground">Delt med {sharedWith}.</p>}
          </form>
        )}

        {!isOwner && userId && (
          <div>
            {confirmLeave ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>Forlate listen? Du må inviteres på nytt for å få tilgang igjen.</span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!online || leave.isPending}
                  onClick={() => leave.mutate(userId, { onSuccess: onLeft })}
                >
                  Ja, forlat
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmLeave(false)}>Avbryt</Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={!online}
                title={online ? undefined : 'Krever nett'}
                onClick={() => setConfirmLeave(true)}
              >
                Forlat listen
              </Button>
            )}
            {leave.isError && <p role="alert" className="mt-1 text-destructive">Kunne ikke forlate listen.</p>}
          </div>
        )}
      </div>
    </details>
  )
}
