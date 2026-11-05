import { useState } from 'react'
import { DEMO, supabase, type Group } from '../supabase'

// Fuente gratuita: TheSportsDB (clave pública "123")
const API = 'https://www.thesportsdb.com/api/v1/json/123/eventsround.php'
export const LEAGUES = [{ id: 4406, name: 'Primera División Argentina' }]

type Ev = Record<string, string | null>
type Cfg = Pick<Group, 'id' | 'league_id' | 'season' | 'round' | 'from_date' | 'to_date'>

export async function syncGroup(g: Cfg): Promise<string> {
  if (!g.league_id || !g.round) return 'Falta configurar la liga y la fecha.'
  const res = await fetch(`${API}?id=${g.league_id}&r=${g.round}&s=${g.season || new Date().getFullYear()}`)
  if (!res.ok) throw new Error(`La fuente de datos respondió ${res.status}`)
  const events: Ev[] = ((await res.json()).events as Ev[] | null) ?? []
  const list = events.filter(
    (e) => (!g.from_date || (e.dateEvent ?? '') >= g.from_date) && (!g.to_date || (e.dateEvent ?? '') <= g.to_date),
  )
  if (!list.length) return 'No encontré partidos con esos datos. Revisá la fecha y el rango de días.'

  const rows = list.map((e) => ({
    group_id: g.id,
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

  const done = list.filter(
    (e) => ['FT', 'AET', 'PEN'].includes(e.strStatus ?? '') && e.intHomeScore != null && e.intAwayScore != null,
  )
  for (const e of done) {
    await supabase.from('matches')
      .update({ home_score: Number(e.intHomeScore), away_score: Number(e.intAwayScore) })
      .eq('group_id', g.id).eq('external_id', String(e.idEvent))
  }
  return `${list.length} partidos actualizados, ${done.length} con resultado.`
}

export default function AutoImport({ group, reload }: { group: Group; reload: () => void }) {
  const [f, setF] = useState({
    league_id: String(group.league_id ?? LEAGUES[0].id),
    season: group.season ?? String(new Date().getFullYear()),
    round: group.round ? String(group.round) : '',
    from_date: group.from_date ?? '',
    to_date: group.to_date ?? '',
  })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (DEMO) return null

  async function run(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg('')
    const cfg = { league_id: +f.league_id, season: f.season, round: +f.round, from_date: f.from_date || null, to_date: f.to_date || null }
    try {
      const u = await supabase.from('groups').update(cfg).eq('id', group.id)
      if (u.error) throw new Error(u.error.message)
      setMsg(await syncGroup({ id: group.id, ...cfg }))
      reload()
    } catch (err) {
      setMsg('No se pudo traer: ' + (err as Error).message)
    }
    setBusy(false)
  }

  return (
    <form className="card" onSubmit={run}>
      <h3>⚡ Traer partidos automáticamente</h3>
      <p className="small muted">Trae partidos, escudos y resultados. Los resultados se actualizan solos cada vez que abrís este prode.</p>
      <select value={f.league_id} onChange={(e) => setF({ ...f, league_id: e.target.value })}>
        {LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input placeholder="Temporada (ej: 2026)" value={f.season} onChange={(e) => setF({ ...f, season: e.target.value })} required />
      <input type="number" min={1} inputMode="numeric" placeholder="Número de fecha (ej: 16)" value={f.round} onChange={(e) => setF({ ...f, round: e.target.value })} required />
      <label className="small muted">Desde (día del primer partido)</label>
      <input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} />
      <label className="small muted">Hasta (día del último partido)</label>
      <input type="date" value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} />
      <button className="primary" disabled={busy}>{busy ? 'Trayendo…' : 'Traer partidos'}</button>
      {msg && <p className="msg">{msg}</p>}
    </form>
  )
}
