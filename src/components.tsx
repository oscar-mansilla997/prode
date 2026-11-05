import { useEffect, useState } from 'react'
import { supabase, type Row } from './supabase'

export function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  const st = { width: size, height: size, fontSize: size * 0.45 }
  return url ? <img className="avatar" style={st} src={url} alt={name} /> : <span className="avatar ph" style={st}>{(name[0] ?? '?').toUpperCase()}</span>
}

export function Ranking({ groupId, finished }: { groupId: string; finished: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => {
    supabase.rpc('get_leaderboard', { gid: groupId }).then(({ data }) => setRows((data as Row[]) ?? []))
  }, [groupId])
  if (rows === null) return <p className="muted">Cargando…</p>
  const paid = rows.filter((r) => r.paid)
  const free = rows.filter((r) => !r.paid)
  const top = (l: Row[]) => l.filter((r) => r.pts === l[0].pts && r.exactos === l[0].exactos)
  const names = (l: Row[]) => top(l).map((r) => r.name).join(' y ')
  const list = (l: Row[], empty: string) =>
    l.length === 0 ? <p className="muted small">{empty}</p> : (
      <div className="card">
        {l.map((r, i) => (
          <div key={r.entry_id} className="row rank">
            <span className="who">{i + 1}. <Avatar url={r.avatar_url} name={r.name} size={28} /> {r.name}</span>
            <span><strong>{r.pts}</strong> pts <span className="muted small">({r.exactos} exactos)</span></span>
          </div>
        ))}
      </div>
    )
  return (
    <>
      {finished && paid.length > 0 && (
        <div className="card win">🏆 <strong>{top(paid).length > 1 ? 'Ganadores' : 'Ganador'} del premio:</strong> {names(paid)} con {paid[0].pts} pts</div>
      )}
      {finished && free.length > 0 && (
        <div className="card">🥈 Mejor puntaje sin pago (sin premio): <strong>{names(free)}</strong> con {free[0].pts} pts</div>
      )}
      <h3>Compiten por el premio</h3>
      {list(paid, 'Todavía no hay jugadas aprobadas.')}
      <h3>Sin pago confirmado</h3>
      <p className="muted small">Juegan pero no se llevan el premio.</p>
      {list(free, 'Nadie por ahora.')}
    </>
  )
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function Crest({ url }: { url?: string | null }) {
  return url ? <img className="crest" src={url} alt="" loading="lazy" /> : null
}
