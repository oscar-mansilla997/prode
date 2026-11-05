import { useState } from 'react'
import { DEMO, supabase, type Group, type Match } from '../supabase'

// Fuente gratuita: TheSportsDB (clave pública "123")
const BASE = 'https://www.thesportsdb.com/api/v1/json/123'
export const LEAGUES = [
  { id: 4406, name: 'Liga Profesional Argentina' },
  { id: 4501, name: 'Copa Libertadores' },
  { id: 4480, name: 'UEFA Champions League' },
  { id: 4328, name: 'Premier League (Inglaterra)' },
  { id: 4335, name: 'La Liga (España)' },
  { id: 4332, name: 'Serie A (Italia)' },
  { id: 4331, name: 'Bundesliga (Alemania)' },
  { id: 4334, name: 'Ligue 1 (Francia)' },
  { id: 4429, name: 'Mundial FIFA' },
]

type Ev = Record<string, string | null>
const FINISHED = ['FT', 'AET', 'PEN']

async function getEvents(path: string): Promise<Ev[]> {
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`La fuente de datos respondió ${res.status}`)
  return ((await res.json()).events as Ev[] | null) ?? []
}

const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10)
const roundNum = (m: Pick<Match, 'round'>) => Number((m.round ?? '').replace(/\D/g, '')) || 0

async function save(groupId: string, list: Ev[]) {
  const rows = list.map((e) => ({
    group_id: groupId,
    external_id: String(e.idEvent),
    round: `Fecha ${e.intRound}`,
    home: e.strHomeTeam,
    away: e.strAwayTeam,
    kickoff: new Date((e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`) + 'Z').toISOString(),
    home_logo: e.strHomeTeamBadge ?? null,
    away_logo: e.strAwayTeamBadge ?? null,
  }))
  const up = await supabase.from('matches').upsert(rows, { onConflict: 'group_id,external_id' })
  if (up.error) throw new Error(up.error.message)
  await applyScores(groupId, list)
}

async function applyScores(groupId: string, list: Ev[]) {
  for (const e of list.filter((x) => FINISHED.includes(x.strStatus ?? '') && x.intHomeScore != null && x.intAwayScore != null)) {
    await supabase.from('matches')
      .update({ home_score: Number(e.intHomeScore), away_score: Number(e.intAwayScore) })
      .eq('group_id', groupId).eq('external_id', String(e.idEvent))
  }
}

/** Busca sola la próxima fecha del torneo y trae sus partidos. */
export async function importNext(groupId: string, leagueId: number): Promise<string> {
  const next = (await getEvents(`eventsnextleague.php?id=${leagueId}`))[0]
  if (!next) return 'Ese torneo no tiene próximos partidos cargados todavía.'
  const season = next.strSeason ?? String(new Date().getFullYear())
  const round = Number(next.intRound)
  const all = await getEvents(`eventsround.php?id=${leagueId}&r=${round}&s=${season}`)
  const center = next.dateEvent ?? ''
  const list = all.filter((e) => (e.dateEvent ?? '') >= addDays(center, -5) && (e.dateEvent ?? '') <= addDays(center, 5))
  if (!list.length) return 'No pude armar la fecha. Probá de nuevo en un rato o cargá los partidos a mano.'
  await save(groupId, list)
  const u = await supabase.from('groups').update({ league_id: leagueId, season, round }).eq('id', groupId)
  if (u.error) throw new Error(u.error.message)
  return `Listo: ${list.length} partidos de la fecha ${round}.`
}

/** Suma la fecha que viene después de la última que ya tenés. */
export async function importFollowing(group: Group, matches: Match[]): Promise<string> {
  if (!group.league_id || !group.season) return 'Primero traé la próxima fecha.'
  const withExt = matches.filter((m) => m.external_id)
  const nextRound = Math.max(0, ...withExt.map(roundNum)) + 1
  const last = withExt.map((m) => m.kickoff).sort().pop()
  if (!last) return 'Primero traé la próxima fecha.'
  const from = addDays(last.slice(0, 10), 1)
  const to = addDays(from, 10)
  const all = await getEvents(`eventsround.php?id=${group.league_id}&r=${nextRound}&s=${group.season}`)
  const list = all.filter((e) => (e.dateEvent ?? '') >= from && (e.dateEvent ?? '') <= to)
  if (!list.length) return `Todavía no hay partidos de la fecha ${nextRound}.`
  await save(group.id, list)
  await supabase.from('groups').update({ round: nextRound }).eq('id', group.id)
  return `Listo: sumé ${list.length} partidos de la fecha ${nextRound}.`
}

/** Carga los resultados de los partidos ya jugados. */
export async function refreshResults(group: Group, matches: Match[]): Promise<void> {
  if (!group.league_id || !group.season) return
  const mine = matches.filter((m) => m.external_id)
  const need = new Set(mine.filter((m) => m.home_score === null && new Date(m.kickoff) < new Date()).map(roundNum))
  for (const r of need) {
    const list = (await getEvents(`eventsround.php?id=${group.league_id}&r=${r}&s=${group.season}`))
      .filter((e) => mine.some((m) => m.external_id === String(e.idEvent)))
    await applyScores(group.id, list)
  }
}

export default function AutoImport({ group, matches, reload }: { group: Group; matches: Match[]; reload: () => void }) {
  const [league, setLeague] = useState(String(group.league_id ?? LEAGUES[0].id))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (DEMO) return null

  async function go(fn: () => Promise<string>) {
    setBusy(true); setMsg('')
    try { setMsg(await fn()); reload() } catch (e) { setMsg('No se pudo traer: ' + (e as Error).message) }
    setBusy(false)
  }
  const has = matches.some((m) => m.external_id)

  return (
    <div className="card">
      <h3>⚡ Partidos automáticos</h3>
      <p className="small muted">Elegí el torneo y la app trae los partidos con escudos. Los resultados se cargan solos cada vez que abrís este prode.</p>
      <select value={league} onChange={(e) => setLeague(e.target.value)}>
        {LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="primary" disabled={busy} onClick={() => go(() => importNext(group.id, +league))}>
        {busy ? 'Trayendo…' : 'Traer la próxima fecha'}
      </button>
      {has && (
        <button className="ghost" disabled={busy} onClick={() => go(() => importFollowing(group, matches))}>
          Sumar la fecha siguiente
        </button>
      )}
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}
