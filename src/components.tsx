import { useEffect, useState } from 'react'
import { isFinished, money, points, sortMatches, supabase, type Match, type Prediction, type Prode, type PubGroup, type Row } from './supabase'

export function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const st = { width: size, height: size, fontSize: size * 0.42 }
  return url ? <img className="avatar" style={st} src={url} alt={name} /> : <span className="avatar ph" style={st}>{(name[0] ?? '?').toUpperCase()}</span>
}

export function Ranking({ groupId, finished, pot, meId }: { groupId: string; finished: boolean; pot?: number; meId?: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    const pull = () => supabase.rpc('get_leaderboard', { gid: groupId }).then(({ data }) => setRows((data as Row[]) ?? []))
    pull()
    const t = setInterval(pull, 20000) // se refresca solo cada 20 segundos
    return () => clearInterval(t)
  }, [groupId])
  if (rows === null) return <p className="muted">Cargando…</p>
  const paid = rows.filter((r) => r.paid)
  const top = paid.filter((r) => paid.length && r.pts === paid[0].pts && r.exactos === paid[0].exactos)
  return (
    <>
      {finished && paid.length > 0 && (
        <div className="card win">
          <div className="eyebrow">{top.length > 1 ? 'Ganadores' : 'Ganador'}</div>
          <h3 style={{ margin: '4px 0' }}>{top.map((r) => r.name).join(' y ')}</h3>
          <div className="small muted">{paid[0].pts} puntos{pot ? <> · se lleva <strong style={{ color: 'var(--gold)' }}>{money(pot)}</strong></> : null}</div>
        </div>
      )}
      {paid.length === 0 ? <p className="empty">Todavía no hay jugadores confirmados.</p> : (
        <div className="card">
          {paid.map((r, i) => (
            <div key={r.entry_id} className={`row rank ${meId && r.entry_id === meId ? 'me' : ''}`}>
              <span className="who"><span className={`pos ${i < 3 ? 'g' + (i + 1) : ''}`}>{i + 1}</span><Avatar url={r.avatar_url} name={r.name} size={30} />{r.name}</span>
              <span><span className="pts">{r.pts}</span> <span className="muted small">pts · {r.exactos} exactos</span></span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Ranking de un campeonato (carga solo los partidos para saber si terminó) */
export function GroupRanking({ group, meId }: { group: Pick<PubGroup, 'id' | 'pot'>; meId?: string }) {
  const [matches, setMatches] = useState<Match[]>([])
  useEffect(() => { supabase.from('matches').select('*').eq('group_id', group.id).then(({ data }) => setMatches((data as Match[]) ?? [])) }, [group.id])
  return <Ranking groupId={group.id} finished={isFinished(matches)} pot={Number(group.pot)} meId={meId} />
}

/** Jugada de un participante, con resultados y puntos */
export function PredList({ groupId, entryId, showPoints = true }: { groupId: string; entryId: string; showPoints?: boolean }) {
  const [ms, setMs] = useState<Match[] | null>(null)
  const [ps, setPs] = useState<Prediction[]>([])
  useEffect(() => {
    ;(async () => {
      const [m, p] = await Promise.all([
        supabase.from('matches').select('*').eq('group_id', groupId).order('kickoff'),
        supabase.from('predictions').select('*').eq('entry_id', entryId),
      ])
      setMs(sortMatches((m.data as Match[]) ?? [])); setPs((p.data as Prediction[]) ?? [])
    })()
  }, [groupId, entryId])
  if (!ms) return <p className="muted small">Cargando…</p>
  let total = 0
  const rows = ms.map((m) => {
    const p = ps.find((x) => x.match_id === m.id)
    const pts = points(p, m)
    if (pts) total += pts
    return (
      <div key={m.id} className="rank">
        <div className="row">
          <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            {m.home_logo && <img className="crest" style={{ width: 22, height: 22 }} src={m.home_logo} alt="" />}{m.home}
            <span className="muted">vs</span>
            {m.away_logo && <img className="crest" style={{ width: 22, height: 22 }} src={m.away_logo} alt="" />}{m.away}
          </span>
          <strong>{p ? `${p.home_pred} - ${p.away_pred}` : '—'}</strong>
        </div>
        {m.home_score !== null && (
          <div className={`realscore r${pts ?? 'x'}`}><span>Resultado</span><b>{m.home_score} - {m.away_score}</b>
            {showPoints && pts !== null && <span className={`pill p${pts}`}>{pts} pts</span>}
          </div>
        )}
      </div>
    )
  })
  return <>{rows}{showPoints && <div className="row" style={{ marginTop: 10 }}><span className="muted small">Total</span><span className="pts">{total} pts</span></div>}</>
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function Crest({ url }: { url?: string | null }) {
  return url ? <img className="crest" src={url} alt="" loading="lazy" /> : null
}

export const Icon = {
  trophy: <svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" /></svg>,
  list: <svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  chart: <svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>,
  shield: <svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" /></svg>,
  user: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg>,
  bell: <svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>,
}

function HistoryItem({ p }: { p: Prode }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mine, setMine] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    ;(async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id
      const e = await supabase.from('entries').select('id, submitted_at').eq('group_id', p.id).eq('user_id', uid!).maybeSingle()
      const row = e.data as { id: string; submitted_at: string | null } | null
      setMine(row?.submitted_at ? row.id : null)
    })()
  }, [p.id])
  useEffect(() => { supabase.rpc('get_leaderboard', { gid: p.id }).then(({ data }) => setRows(((data as Row[]) ?? []).filter((r) => r.paid))) }, [p.id])
  return (
    <div className="card">
      <div className="muted small" style={{ margin: 0 }}>{p.round ? `Fecha ${p.round}` : p.name}</div>
      {rows === null ? <p className="muted small">Cargando…</p> : rows.length === 0 ? <p className="muted small">Sin participantes.</p> : rows.map((r, i) => (
        <div key={r.entry_id} className="row" style={{ marginTop: 8 }}>
          <span className="who"><span className="muted small" style={{ width: 16 }}>{i + 1}</span><Avatar url={r.avatar_url} name={r.name || '?'} size={28} /><strong>{r.name}</strong></span>
          <span className="pts">{r.pts} pts</span>
        </div>
      ))}
      {mine && <button className="link" onClick={() => setShow(!show)}>{show ? 'Ocultar mi jugada' : 'Ver mi jugada'}</button>}
      {mine && show && <PredList groupId={p.id} entryId={mine} />}
    </div>
  )
}

/** Fechas ya terminadas de este campeonato: solo usuario y puntaje, escondido hasta que se abre */
export function History({ name, exceptId }: { name: string; exceptId: string }) {
  const [list, setList] = useState<Prode[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => { supabase.rpc('list_history').then(({ data }) => setList(((data as Prode[]) ?? []).filter((x) => x.name === name && x.id !== exceptId))) }, [name, exceptId])
  if (list.length === 0) return null
  return (
    <>
      <button className="ghost" onClick={() => setOpen(!open)}>{open ? 'Ocultar historial' : `Historial (${list.length} ${list.length === 1 ? 'fecha' : 'fechas'})`}</button>
      {open && list.map((p) => <HistoryItem key={p.id} p={p} />)}
    </>
  )
}
