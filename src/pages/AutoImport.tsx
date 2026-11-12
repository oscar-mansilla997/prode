import { useEffect, useState } from 'react'
import { DEMO, supabase, type Group, type Match } from '../supabase'
import { Crest, fmtDate } from '../components'

// Fuente gratuita: TheSportsDB (clave pública "123")
const BASE = 'https://www.thesportsdb.com/api/v1/json/123'
export const LEAGUES = [
  { id: 4406, name: 'Liga Profesional Argentina' },
  { id: 4501, name: 'Copa Libertadores' },
  { id: 4724, name: 'Copa Sudamericana' },
  { id: 4480, name: 'UEFA Champions League' },
  { id: 4328, name: 'Premier League (Inglaterra)' },
  { id: 4335, name: 'La Liga (España)' },
  { id: 4332, name: 'Serie A (Italia)' },
  { id: 4331, name: 'Bundesliga (Alemania)' },
  { id: 4334, name: 'Ligue 1 (Francia)' },
  { id: 4429, name: 'Mundial FIFA' },
  { id: 4562, name: 'Amistosos internacionales' },
  { id: 4490, name: 'Liga de las Naciones UEFA' },
  { id: 4481, name: 'UEFA Europa League' },
  { id: 4499, name: 'Copa América' },
  { id: 4502, name: 'Eurocopa' },
  { id: 4496, name: 'Copa Africana de Naciones' },
  { id: 4503, name: 'Mundial de Clubes' },
  { id: 4500, name: 'Copa Argentina' },
  { id: 4351, name: 'Brasileirão (Brasil)' },
  { id: 4346, name: 'MLS (Estados Unidos)' },
  { id: 4350, name: 'Liga MX (México)' },
  { id: 4432, name: 'Primera División (Uruguay)' },
  { id: 4497, name: 'Liga Colombiana' },
  { id: 4337, name: 'Eredivisie (Países Bajos)' },
  { id: 4344, name: 'Primeira Liga (Portugal)' },
  { id: 4339, name: 'Süper Lig (Turquía)' },
  { id: 4329, name: 'Championship (Inglaterra)' },
  { id: 4482, name: 'FA Cup (Inglaterra)' },
  { id: 4483, name: 'Copa del Rey (España)' },
]

export const FRIENDLIES = 4562
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
      .eq('group_id', groupId).eq('external_id', String(e.idEvent)).eq('score_manual', false)
  }
}

/** Busca sola la próxima fecha del torneo y trae sus partidos. */
export async function importNext(groupId: string, leagueId: number): Promise<string> {
  if (leagueId === FRIENDLIES) return 'Elegí los amistosos de la lista.'
  const next = (await getEvents(`eventsnextleague.php?id=${leagueId}`))[0]
  if (!next) return 'Ese torneo no tiene próximos partidos cargados todavía.'
  const season = next.strSeason ?? String(new Date().getFullYear())
  const round = Number(next.intRound)
  const all = await getEvents(`eventsround.php?id=${leagueId}&r=${round}&s=${season}`)
  const center = next.dateEvent ?? ''
  const list = all.filter((e) => (e.dateEvent ?? '') >= addDays(center, -5) && (e.dateEvent ?? '') <= addDays(center, 5))
  if (!list.length) return 'No pude armar la fecha. Probá de nuevo en un rato o cargá los partidos a mano.'
  await save(groupId, list)
  const u = await supabase.from('groups').update({ league_id: leagueId, season, round, logo: next.strLeagueBadge ?? null }).eq('id', groupId)
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
  if (Number(group.league_id) === FRIENDLIES) {
    for (const m of mine.filter((x) => x.home_score === null && new Date(x.kickoff) < new Date())) {
      const [e] = await getEvents(`lookupevent.php?id=${m.external_id}`)
      if (e) await applyScores(group.id, [e])
    }
    return
  }
  const need = new Set(mine.filter((m) => m.home_score === null && new Date(m.kickoff) < new Date()).map(roundNum))
  for (const r of need) {
    const list = (await getEvents(`eventsround.php?id=${group.league_id}&r=${r}&s=${group.season}`))
      .filter((e) => mine.some((m) => m.external_id === String(e.idEvent)))
    await applyScores(group.id, list)
  }
}

export default function AutoImport({ group, matches, reload }: { group: Group; matches: Match[]; reload: () => void }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (DEMO) return null
  async function go() {
    setBusy(true); setMsg('')
    try { await refreshResults(group, matches); setMsg('Resultados al día.'); reload() } catch (e) { setMsg('No se pudo actualizar: ' + (e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Partidos automáticos</h3>
      <p className="small muted">Los partidos y resultados de esta fecha se cargan solos. Cuando todos tienen resultado, se avisa al ganador y se abre sola la fecha siguiente.</p>
      <button className="ghost" disabled={busy} onClick={go}>{busy ? 'Actualizando…' : 'Actualizar resultados ahora'}</button>
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}

const crestCache = new Map<string, string | null>()
/** Escudo de una selección o club buscando su nombre en TheSportsDB */
export async function crestFor(name: string): Promise<string | null> {
  const q = name.trim()
  if (q.length < 3) return null
  const k = q.toLowerCase()
  if (crestCache.has(k)) return crestCache.get(k)!
  let url: string | null = null
  try {
    const res = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(q)}`)
    const teams = res.ok ? (((await res.json()).teams as Ev[] | null) ?? []).filter((t) => t.strSport === 'Soccer') : []
    const t = teams.find((x) => (x.strTeam ?? '').toLowerCase() === k) ?? teams[0]
    url = (t?.strBadge ?? t?.strTeamBadge ?? null) as string | null
  } catch { /* sin escudo */ }
  crestCache.set(k, url)
  return url
}

const SKIP = /\b(U-?\d{2}|women|femenin|\(w\)| W$)/i

/** Amistosos: se eligen de la lista de los próximos días (no tienen fechas numeradas) */
export function Amistosos({ group, matches, reload }: { group: Group; matches: Match[]; reload: () => void }) {
  const [list, setList] = useState<Ev[] | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [all, setAll] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const have = new Set(matches.map((m) => m.external_id))

  async function load() {
    setBusy(true); setMsg('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      const days = Array.from({ length: 10 }, (_, i) => addDays(today, i))
      const res = await Promise.all(days.map((d) => getEvents(`eventsday.php?d=${d}&l=${FRIENDLIES}`).catch(() => [] as Ev[])))
      const ev = res.flat().filter((e) => String(e.idLeague) === String(FRIENDLIES) && e.idEvent && e.strHomeTeam && e.strAwayTeam)
      ev.sort((a, b) => String(a.strTimestamp ?? a.dateEvent).localeCompare(String(b.strTimestamp ?? b.dateEvent)))
      setList(ev)
      if (!ev.length) setMsg('No hay amistosos cargados en la fuente para los próximos 10 días.')
    } catch (e) { setMsg('No se pudo traer la lista: ' + (e as Error).message) }
    setBusy(false)
  }
  const norm = (t: string | null) => (t ?? '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')
  const dup = (e: Ev) => {
    const t = new Date((e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`) + 'Z').getTime()
    return matches.some((m) => Math.abs(new Date(m.kickoff).getTime() - t) < 36e5 * 30 &&
      ((norm(m.home) === norm(e.strHomeTeam) && norm(m.away) === norm(e.strAwayTeam)) || (norm(m.home) === norm(e.strAwayTeam) && norm(m.away) === norm(e.strHomeTeam))))
  }
  const shown = (list ?? []).filter((e) => !have.has(String(e.idEvent)) && !dup(e) && (all || !(SKIP.test(e.strHomeTeam ?? '') || SKIP.test(e.strAwayTeam ?? ''))))
  const toggle = (id: string) => setPick((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  async function add() {
    const chosen = (list ?? []).filter((e) => pick.has(String(e.idEvent)))
    if (!chosen.length) return
    setBusy(true); setMsg('')
    try {
      const rows = chosen.map((e) => ({
        group_id: group.id, external_id: String(e.idEvent), round: 'Amistoso',
        home: e.strHomeTeam, away: e.strAwayTeam,
        kickoff: new Date((e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`) + 'Z').toISOString(),
        home_logo: e.strHomeTeamBadge ?? null, away_logo: e.strAwayTeamBadge ?? null,
      }))
      const up = await supabase.from('matches').upsert(rows, { onConflict: 'group_id,external_id' })
      if (up.error) throw new Error(up.error.message)
      if (!group.league_id) await supabase.from('groups').update({ league_id: FRIENDLIES }).eq('id', group.id)
      setPick(new Set()); setMsg(`Listo: sumaste ${rows.length} partidos.`); reload()
    } catch (e) { setMsg((e as Error).message) }
    setBusy(false)
  }
  const [man, setMan] = useState({ home: '', away: '', when: '' })
  const [mc, setMc] = useState<{ home: string | null; away: string | null }>({ home: null, away: null })
  useEffect(() => {
    const t = setTimeout(async () => {
      const [h, a] = await Promise.all([crestFor(man.home), crestFor(man.away)])
      setMc({ home: h, away: a })
    }, 500)
    return () => clearTimeout(t)
  }, [man.home, man.away])
  async function addManual(ev: React.FormEvent) {
    ev.preventDefault()
    if (!man.home.trim() || !man.away.trim() || !man.when) return setMsg('Completá los dos equipos y el día y la hora.')
    setBusy(true); setMsg('')
    const { error } = await supabase.from('matches').insert({
      group_id: group.id, round: 'Amistoso', home: man.home.trim(), away: man.away.trim(), kickoff: new Date(man.when).toISOString(),
      home_logo: mc.home, away_logo: mc.away,
    })
    if (!error && !group.league_id) await supabase.from('groups').update({ league_id: FRIENDLIES }).eq('id', group.id)
    setBusy(false)
    if (error) return setMsg(error.message)
    setMan({ home: '', away: '', when: '' }); setMsg('Partido agregado.'); reload()
  }
  async function results() {
    setBusy(true); setMsg('')
    try { await refreshResults(group, matches); setMsg('Resultados al día.'); reload() } catch (e) { setMsg('No se pudo actualizar: ' + (e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="card">
      <h3>Amistosos internacionales</h3>
      <p className="small muted">Traé la lista de los próximos 10 días y tildá los partidos que quieras en este campeonato.</p>
      <h3>Cargar un partido a mano (ej: Argentina)</h3>
      <form onSubmit={addManual}>
        <label className="lbl">Equipo local</label>
        <input value={man.home} onChange={(e) => setMan({ ...man, home: e.target.value })} placeholder="Ej: Argentina" />
        <label className="lbl">Equipo visitante</label>
        <input value={man.away} onChange={(e) => setMan({ ...man, away: e.target.value })} placeholder="Ej: Uruguay" />
        <label className="lbl">Día y hora (hora de Argentina)</label>
        <input type="datetime-local" value={man.when} onChange={(e) => setMan({ ...man, when: e.target.value })} />
        {(man.home.trim() || man.away.trim()) && (
          <div className="card match">
            <div className="muted small" style={{ margin: 0 }}>Así va a quedar{man.when ? ' · ' + fmtDate(new Date(man.when).toISOString()) : ''}</div>
            <div className="teams" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span className="team"><Crest url={mc.home} />{man.home || '—'}</span>
              <span className="muted">vs</span>
              <span className="team right">{man.away || '—'}<Crest url={mc.away} /></span>
            </div>
          </div>
        )}
        <button className="primary" disabled={busy}>Agregar partido</button>
      </form>
      <h3>O elegilo de la lista</h3>
      <button className="primary" disabled={busy} onClick={load}>{busy ? 'Buscando…' : list ? 'Actualizar lista' : 'Traer amistosos'}</button>
      {list && list.length > 0 && (
        <>
          <button className="ghost" onClick={() => setAll(!all)}>{all ? 'Ocultar sub-20, sub-23 y femenino' : 'Mostrar también sub-20, sub-23 y femenino'}</button>
          <p className="small muted">Tocá los partidos que quieras agregar.</p>
          {shown.map((e) => {
            const on = pick.has(String(e.idEvent))
            const ko = new Date((e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`) + 'Z').toISOString()
            return (
              <button key={String(e.idEvent)} className={`card match amis ${on ? 'on' : ''}`} onClick={() => toggle(String(e.idEvent))}>
                <div className="row">
                  <div className="muted small" style={{ margin: 0 }}>{fmtDate(ko)}</div>
                  <span className={`amis-check ${on ? 'on' : ''}`}>{on ? '✓ Elegido' : 'Tocar para elegir'}</span>
                </div>
                <div className="teams">
                  <span className="team"><Crest url={e.strHomeTeamBadge ?? null} />{e.strHomeTeam}</span>
                  <span className="muted">vs</span>
                  <span className="team right">{e.strAwayTeam}<Crest url={e.strAwayTeamBadge ?? null} /></span>
                </div>
              </button>
            )
          })}
          {pick.size > 0 && <div className="stickybar"><button className="primary" disabled={busy} onClick={add}>Agregar {pick.size} partido(s)</button></div>}
        </>
      )}
      <p className="small muted">El escudo se busca solo por el nombre, escribilo en inglés si no aparece (ej: United States). El resultado de estos partidos lo cargás vos en la lista de abajo.</p>
      <button className="ghost" disabled={busy} onClick={results}>Actualizar resultados</button>
      {msg && <p className="small">{msg}</p>}
    </div>
  )
}
