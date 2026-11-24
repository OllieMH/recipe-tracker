import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCreateList, useListCounts, useShoppingLists } from '@/lib/shopping'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ShoppingListsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const lists = useShoppingLists()
  const counts = useListCounts()
  const create = useCreateList()
  const [name, setName] = useState('')

  function onCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    create.mutate(trimmed, {
      onSuccess: (id) => {
        setName('')
        navigate(`/handleliste/${id}`)
      },
    })
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 pb-16">
      <h1 className="text-3xl font-extrabold tracking-tight">Handlelister</h1>

      <form onSubmit={onCreate} className="flex gap-2">
        <Input
          aria-label="Navn på ny liste"
          placeholder="Ny liste, f.eks. Ukeshandel"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          Opprett
        </Button>
      </form>
      {create.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke opprette listen. Prøv igjen.</p>}

      {lists.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
      {lists.isError && <p role="alert" className="text-sm text-destructive">Kunne ikke hente listene.</p>}

      {lists.data && lists.data.length === 0 && (
        <p className="text-muted-foreground">Du har ingen lister ennå. Lag en over, så kan du legge til varer og oppskrifter.</p>
      )}

      {lists.data && lists.data.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card">
          {lists.data.map((l) => {
            const c = counts.data?.get(l.id)
            return (
              <li key={l.id}>
                <Link to={`/handleliste/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {c && c.total > 0 ? `${c.open} igjen av ${c.total}` : 'Tom'}
                      {l.owner_id !== user?.id && ' · delt med deg'}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
