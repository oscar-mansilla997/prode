import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEMO, supabase, type Entry, type Group, type Profile } from '../supabase'
import { Avatar, PredList } from '../components'
import { LEAGUES, importNext } from './AutoImport'

type Req = Entry & { profile: Profile; group: { id: string; name: string; fee: string | null; logo: string | null } }

export default function Admin() {
  const [tab, setTab] = useState<'solicitudes' | 'campeonatos'>('solicitudes')
  const [groups, setGroups] = useState<Group[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', fee: '', pay_alias: '', pct: '' })
  const [pct, setPct] = useState('')
  const [pctMsg, setPctMsg] = useState('')

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const g = await supabase.from('groups').select('*').eq('owner_id', uid!).order('created_at', { ascending: false })
    const gl = (g.data as Group[]) ?? []
    setGroups(gl)
    setPct((cur) => (cur === '' && gl[0] ? String(gl[0].commission_pct ?? 0) : cur))
    if (gl.length) {
      const r = await supabase.from('entries').select('*, profile:profiles(*), group:groups(id, name, fee, logo)')
        .in('group_id', gl.map((x) => x.id)).eq('status', 'pending').order('submitted_at')
      setReqs(((r.data as unknown as Req[]) ?? []).filter((x) => x.submitted_at))
    } else setReqs([])
  }, [])
  useEffect(() => { load() }, [load])

  async function decide(r: Req, status: 'approved' | 'rejected') {
    await supabase.from('entries').update({ status }).eq('id', r.id)
    load()
  }
  async function savePct() {
    const v = Math.min(100, Math.max(0, Number(pct) || 0))
    setPct(String(v))
    const { error } = await supabase.from('groups').update({ commission_pct: v }).in('id', groups.map((g) => g.id))
    setPctMsg(error ? error.message : 'Guardado en todos los campeonatos ✓')
    if (!error) load()
  }
  async function setActive(g: Group, active: boolean) {
    setBusy(true)
    await supabase.from('groups').update({ active }).eq('id', g.id)
    await load(); setBusy(false)
  }
  async function toggleLeague(l: { id: number; name: string }, g?: Group) {
    if (g) return setActive(g, !g.active)
    setBusy(true); setErr('')
    const base = groups[0]
    const { data, error } = await supabase.from('groups')
      .insert({ name: `Prode ${l.name}`, fee: base?.fee ?? null, pay_alias: base?.pay_alias ?? null, commission_pct: base?.commission_pct ?? 0 })
      .select().single()
    if (error) { setBusy(false); return setErr(error.message) }
    try { await importNext((data as Group).id, l.id) } catch { /* se reintenta al abrir el campeonato */ }
    await load(); setBusy(false)
  }
  async function createCustom(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const { error } = await supabase.from('groups').insert({ name: f.name, fee: f.fee || null, pay_alias: f.pay_alias || null, commission_pct: Math.min(100, Math.max(0, Number(f.pct) || 0)) })
    setBusy(false)
    if (error) return setErr(error.message)
    setCreating(false); setF({ name: '', fee: '', pay_alias: '', pct: '' }); load()
  }

  return (
    <>
      <h2 style={{ marginTop: 8 }}>Administración</h2>
      <div className="seg">
        <button className={tab === 'solicitudes' ? 'on' : ''} onClick={() => setTab('solicitudes')}>Solicitudes{reqs.length > 0 && <span className="n">{reqs.length}</span>}</button>
        <button className={tab === 'campeonatos' ? 'on' : ''} onClick={() => setTab('campeonatos')}>Campeonatos</button>
      </div>

      {tab === 'solicitudes' && (reqs.length === 0 ? <p className="empty">No hay solicitudes pendientes.<br />Cuando alguien envíe su jugada, aparece acá para que confirmes el pago.</p> : reqs.map((r) => {
        const digits = r.profile.phone.replace(/\D/g, '')
        return (
          <div key={r.id} className="card">
            <div className="row">
              <span className="who"><Avatar url={r.profile.avatar_url} name={r.profile.name} size={42} />
                <span><strong>{r.profile.name}</strong><div className="small muted" style={{ margin: 0 }}>{r.group.name}</div></span></span>
              {r.group.fee && <strong style={{ color: 'var(--gold)' }}>{r.group.fee}</strong>}
            </div>
            <div className="small">Alias del jugador: <strong>{r.profile.alias}</strong></div>
            <div className="small"><a className="link" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">WhatsApp {r.profile.phone}</a></div>
            <div className="actions">
              <button className="primary small" onClick={() => decide(r, 'approved')}>Confirmar pago</button>
              <button className="danger" onClick={() => decide(r, 'rejected')}>Rechazar</button>
              <button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Ocultar jugada' : 'Ver jugada'}</button>
            </div>
            {open === r.id && <div style={{ marginTop: 8 }}><PredList groupId={r.group.id} entryId={r.id} showPoints={false} /></div>}
          </div>
        )
      }))}

      {tab === 'campeonatos' && (
        <>
          <div className="card pot">
            <div className="eyebrow">Tu ganancia</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span>Porcentaje que te queda de cada pozo</span>
              <span><input className="pct" type="number" min={0} max={100} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /> %</span>
            </div>
            <p className="small muted">Se descuenta del total recaudado: el resto es el premio. Ej: 4 jugadores × $5.000 con 10% → pozo $18.000 y te quedan $2.000.</p>
            <button className="primary small" onClick={savePct}>Guardar</button>
            {pctMsg && <span className="small muted"> {pctMsg}</span>}
          </div>
          <p className="small muted">Prendé los campeonatos que querés ofrecer. Al prender uno nuevo, trae solo los partidos y el logo.</p>
          {LEAGUES.map((l) => {
            const g = groups.find((x) => x.league_id === l.id)
            return (
              <div key={l.id} className="card row">
                {g ? <Link to={`/g/${g.id}`} className="link" style={{ color: 'var(--txt)' }}><strong>{l.name}</strong> <span className="muted small">Administrar ›</span></Link> : <strong>{l.name}</strong>}
                <button className={`toggle ${g?.active ? 'on' : ''}`} disabled={busy} onClick={() => toggleLeague(l, g)}>{g?.active ? 'Activo' : 'Apagado'}</button>
              </div>
            )
          })}
          {groups.filter((g) => !LEAGUES.some((l) => l.id === g.league_id)).map((g) => (
            <div key={g.id} className="card row">
              <Link to={`/g/${g.id}`} className="link" style={{ color: 'var(--txt)' }}><strong>{g.name}</strong> <span className="muted small">Administrar ›</span></Link>
              <button className={`toggle ${g.active ? 'on' : ''}`} disabled={busy} onClick={() => setActive(g, !g.active)}>{g.active ? 'Activo' : 'Apagado'}</button>
            </div>
          ))}
          {err && <p className="msg">{err}</p>}
          {!creating ? <button className="ghost" onClick={() => setCreating(true)}>Crear campeonato con partidos a mano</button> : (
            <form className="card" onSubmit={createCustom}>
              <input placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
              <input placeholder="Valor de la jugada (ej: $5000)" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
              <input type="number" min={0} max={100} inputMode="decimal" placeholder="Tu porcentaje del pozo" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />
              <input placeholder="Alias para recibir la transferencia" value={f.pay_alias} onChange={(e) => setF({ ...f, pay_alias: e.target.value })} />
              <button className="primary" disabled={busy}>Crear</button>
              <button type="button" className="link" onClick={() => setCreating(false)}>Cancelar</button>
            </form>
          )}
        </>
      )}
      {DEMO && <p className="small muted">Modo demo</p>}
    </>
  )
}
