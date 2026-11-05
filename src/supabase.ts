import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mockClient } from './mock'

export const DEMO = Boolean(import.meta.env.VITE_DEMO)

export const supabase: SupabaseClient = DEMO
  ? (mockClient as SupabaseClient)
  : createClient(import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost', import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'missing')

export const configured = DEMO || Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export type Group = { id: string; name: string; code: string; owner_id: string; fee: string | null; pay_alias: string | null; closes_at: string | null
  league_id: number | null; season: string | null; round: number | null; from_date: string | null; to_date: string | null; logo: string | null; commission_pct: number }
export type PubGroup = { id: string; name: string; fee: string | null; pay_alias: string | null; closes_at: string | null; logo: string | null; pot: number; players: number }
export type Prode = { id: string; name: string; fee: string | null; code: string; logo: string | null; matches: number; players: number; pot: number }
export type Match = {
  id: string
  group_id: string
  round: string | null
  home: string
  away: string
  kickoff: string
  home_score: number | null
  away_score: number | null
  external_id?: string | null
  home_logo?: string | null
  away_logo?: string | null
}
export type Profile = { id: string; name: string; phone: string; alias: string; birth_date: string | null; avatar_url: string | null }
export type Entry = {
  id: string
  group_id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  submitted_at: string | null
  profile?: Profile
}
export type Prediction = { entry_id: string; match_id: string; home_pred: number; away_pred: number }
export type Row = { entry_id: string; name: string; avatar_url: string | null; paid: boolean; pts: number; exactos: number }

export function points(p: { home_pred: number; away_pred: number } | undefined, m: Match): number | null {
  if (!p || m.home_score === null || m.away_score === null) return null
  if (p.home_pred === m.home_score && p.away_pred === m.away_score) return 3
  return Math.sign(p.home_pred - p.away_pred) === Math.sign(m.home_score - m.away_score) ? 1 : 0
}

export const statusLabel = { pending: 'Pendiente de pago', approved: 'Aprobado ✓', rejected: 'Rechazado' } as const

// El prode termina cuando el último partido tiene resultado
export function isFinished(matches: Match[]) {
  return matches.length > 0 && matches.every((m) => m.home_score !== null)
}

// Dinero: "$5.000" -> 5000
export const feeNum = (fee: string | null) => Number((fee ?? '').replace(/\D/g, '')) || 0
export const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
