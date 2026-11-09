import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ShareButton, { appUrl } from '../Share'
import { PushBanner } from '../PushPrompt'
import { supabase, statusLabel, isFree, money, type Entry, type Prode, type Row } from '../supabase'
import { Avatar } from '../components'

export default function Groups() {
  const [prodes, setProdes] = useState<Prode[] | null>(null)
  const [hist, setHist] = useState<Prode[]>([])
  const [mine, setMine] = useState<Record<string, Entry>>({})

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const [p, e, h] = await Promise.all([
      supabase.rpc('list_prodes'),
      supabase.from('entries').select('*, group:groups(id, code)').eq('user_id', uid!),
      supabase.rpc('list_history'),
    ])
    setHist(((h.data as Prode[]) ?? []).map((x) => ({ ...x, pot: Number(x.pot), players: Number(x.players) })))
    setProdes(((p.data as Prode[]) ?? []).map((x) => ({ ...x, matches: Number(x.matches), players: Number(x.players), pot: Number(x.pot) })))
    const map: Record<string, Entry> = {}
    for (const row of ((e.data as unknown as (Entry & { group: { code: string } })[]) ?? [])) map[row.group.code] = row
    setMine(map)
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <>
      <PushBanner />
      <div className="eyebrow" style={{ marginTop: 8 }}>Torneos disponibles</div>
      <h2 style={{ marginTop: 4 }}>Campeonatos</h2>
      <ShareButton text='Sumate a La Cabra Sport, el prode de fútbol. Armá tu jugada y competí por el pozo de cada fecha:' url={appUrl()} label='Invitar amigos por WhatsApp' ghost={false} />
      {prodes === null ? <p className="muted">Cargando…</p> : prodes.length === 0 ? <p className="empty">Todavía no hay campeonatos habilitados.</p> : (
        <div className="prodes">
          {prodes.map((p) => {
            const m = mine[p.code]
            return (
              <Link key={p.id} to={`/p/${p.code}`} className="card prode">
                {p.logo ? <img className="logo" src={p.logo} alt="" /> : <div className="logo ball">⚽</div>}
                {p.round && <span className={`pill ${p.finished ? 's-rejected' : 's-approved'}`} style={{ margin: 0 }}>Fecha {p.round}{p.finished ? ' · terminada' : ''}</span>}
                <strong className="pname">{p.name}</strong>
                <div className="pozo-box">{isFree(p.fee) ? <><span>Campeonato</span><b style={{ color: 'var(--txt)' }}>Amistoso</b></> : <><span>Pozo</span><b>{money(p.pot)}</b></>}</div>
                <div className="stats">
                  <div><span>Jugada</span><b>{isFree(p.fee) ? 'Gratis' : money(Number(p.fee!.replace(/\D/g, '')))}</b></div>
                  <div><span>Jugando</span><b>{p.players}</b></div>
                </div>
                {m && <span className={`pill s-${m.status}`} style={{ margin: '4px 0 0' }}>{m.submitted_at ? statusLabel[m.status] : 'Falta enviar'}</span>}
              </Link>
            )
          })}
        </div>
      )}
      {hist.length > 0 && (
        <>
          <h3 style={{ marginTop: 22 }}>Historial</h3>
          {hist.map((p) => <HistoryItem key={p.id} p={p} />)}
        </>
      )}
    </>
  )
}

function HistoryItem({ p }: { p: Prode }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { supabase.rpc('get_leaderboard', { gid: p.id }).then(({ data }) => setRows(((data as Row[]) ?? []).filter((r) => r.paid))) }, [p.id])
  return (
    <div className="card">
      <div className="muted small" style={{ margin: 0 }}>{p.name}{p.round ? ` · Fecha ${p.round}` : ''}</div>
      {rows === null ? <p className="muted small">Cargando…</p> : rows.length === 0 ? <p className="muted small">Sin participantes.</p> : rows.map((r, i) => (
        <div key={r.entry_id} className="row" style={{ marginTop: 8 }}>
          <span className="who"><span className="muted small" style={{ width: 16 }}>{i + 1}</span><Avatar url={r.avatar_url} name={r.name || '?'} size={28} /><strong>{r.name}</strong></span>
          <span className="pts">{r.pts} pts</span>
        </div>
      ))}
    </div>
  )
}
