import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

export const SUGGESTION_KINDS = ['idea', 'problem', 'other'] as const
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number]

export const SUGGESTION_STATUSES = ['new', 'planned', 'done', 'declined'] as const
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]

export const KIND_LABELS: Record<SuggestionKind, string> = {
  idea: 'Idé eller ønske',
  problem: 'Noe virker ikke',
  other: 'Annet',
}

export const STATUS_LABELS: Record<SuggestionStatus, string> = {
  new: 'Mottatt',
  planned: 'På lista',
  done: 'Gjort',
  declined: 'Blir ikke gjort',
}

export const MAX_BODY = 2000

const MINE = ['suggestions', 'mine'] as const
const ALL = ['suggestions', 'all'] as const

/** The signed-in user's own suggestions (RLS shows only those, admins see all, so filter). */
export function useMySuggestions(userId: string | undefined) {
  return useQuery({
    queryKey: [...MINE, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suggestions')
        .select('id, kind, body, status, reply, created_at')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useSendSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { kind: SuggestionKind; body: string }) => {
      const { error } = await supabase.from('suggestions').insert(v)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

export function useDeleteSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suggestions').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

// ---------- admin ----------

export function useAllSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: ALL,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_suggestions')
      if (error) throw error
      return data
    },
  })
}

export function useAnswerSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: SuggestionStatus; reply: string }) => {
      const { error } = await supabase
        .from('suggestions')
        .update({ status: v.status, reply: v.reply.trim() || null })
        .eq('id', v.id)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['suggestions'] }),
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
}
