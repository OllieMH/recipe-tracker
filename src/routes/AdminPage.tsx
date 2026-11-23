import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const emailSchema = z.email('Skriv inn en gyldig e-postadresse.')

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('nb-NO') : '–'
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users')
      if (error) throw error
      return data
    },
  })

  const invite = useMutation({
    mutationFn: async (vars: { email: string; display_name: string }) => {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { ...vars, redirect_to: `${window.location.origin}/sett-passord` },
      })
      if (error) {
        // Surface the function's own error message when available
        const body = await (error as { context?: Response }).context?.json().catch(() => null)
        throw new Error(body?.error ?? error.message)
      }
      return data
    },
    onSuccess: (_d, vars) => {
      setMessage({ ok: true, text: `Invitasjon sendt til ${vars.email}.` })
      setEmail('')
      setDisplayName('')
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => setMessage({ ok: false, text: `Kunne ikke sende invitasjon: ${err.message}` }),
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const parsed = emailSchema.safeParse(email.trim())
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0].message })
      return
    }
    invite.mutate({ email: parsed.data, display_name: displayName.trim() })
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-4">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-email">E-post</Label>
            <Input id="invite-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="invite-name">Visningsnavn (valgfritt)</Label>
            <Input id="invite-name" value={displayName}
              onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? 'Sender …' : 'Inviter'}
          </Button>
        </form>
        {message && (
          <p role="status" className={message.ok ? 'text-sm' : 'text-sm text-destructive'}>
            {message.text}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Brukere</h2>
        {users.isLoading && <p className="text-sm text-muted-foreground">Laster …</p>}
        {users.error && <p className="text-sm text-destructive">Kunne ikke hente brukere.</p>}
        {users.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>E-post</TableHead>
                <TableHead>Sist innlogget</TableHead>
                <TableHead className="text-right">Importer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.display_name}{u.is_admin ? ' (admin)' : ''}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{formatDate(u.last_sign_in_at)}</TableCell>
                  <TableCell className="text-right">{u.import_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  )
}
