import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO, feeNum, money, supabase, type Entry, type Group, type Profile } from '../supabase'
import { Avatar, PredList } from '../components'
import { LEAGUES, importNext } from './AutoImport'
import { ask } from '../dialogs'
import { uploadCrest } from '../upload'

type Req = Entry & { profile: Profile; group: { id: string; name: string; fee: string | null; logo: string | null } }

export default function Admin() {
  const [tab, setTab] = useState<'resumen' | 'solicitudes' | 'campeonatos' | 'equipos' | 'usuarios'>('resumen')
  const [groups, setGroups] = useState<Group[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', fee: '', pay_alias: '', pct: '' })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const nav = useNavigate()
  const [pct, setPct] = useState('')
  const [fee, setFee] = useState('')
  const [pctMsg, setPctMsg] = useState('')

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const g = await supabase.from('groups').select('*').eq('owner_id', uid!).order('created_at', { ascending: false })
    const gl = (g.data as Group[]) ?? []
    setGroups(gl)
    setPct((cur) => (cur === '' && gl[0] ? String(gl[0].commission_pct ?? 0) : cur))
    setFee((cur) => (cur === '' && gl[0] ? String(feeNum(gl[0].fee)) : cur))
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
    let blocked = 0
    const f = String(Math.max(0, Math.round(Number(fee.replace(/\D/g, '')) || 0)))
    setFee(f)
    for (const g of groups) {
      if (g.finish_notified) continue
      const patch: Record<string, unknown> = {}
      if (Number(g.commission_pct) !== v) patch.commission_pct = v
      if (feeNum(g.fee) !== Number(f)) patch.fee = f === '0' ? null : f
      if (!Object.keys(patch).length) continue
      const { error } = await supabase.from('groups').update(patch).eq('id', g.id)
      if (error) blocked++
    }
    setPctMsg(blocked ? `${blocked} campeonato(s) tienen una fecha en juego y no se pueden cambiar ahora.` : 'Guardado ✓')
    load()
  }
  async function setActive(g: Group, active: boolean) {
    setBusy(true)
    const { error } = await supabase.from('groups').update({ active }).eq('id', g.id)
    if (error) setErr(error.message)
    await load(); setBusy(false)
  }
  async function toggleLeague(l: { id: number; name: string }, g?: Group) {
    if (g) return setActive(g, !g.active)
    setBusy(true); setErr('')
    const base = groups[0]
    const { data, error } = await supabase.from('groups')
      .insert({ name: `Prode ${l.name}`, league_id: l.id, fee: base?.fee ?? null, pay_alias: base?.pay_alias ?? null, commission_pct: base?.commission_pct ?? 0 })
      .select().single()
    if (error) { setBusy(false); return setErr(error.message) }
    try { await importNext((data as Group).id, l.id) } catch { /* se reintenta al abrir el campeonato */ }
    await load(); setBusy(false)
  }
  async function createNext(g: Group) {
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('groups').insert({
      name: g.name, fee: g.fee, pay_alias: g.pay_alias, commission_pct: g.commission_pct, logo: g.logo,
      league_id: g.league_id, season: g.season, round: (g.round ?? 0) + 1,
    }).select().single()
    setBusy(false)
    if (error) return setErr(error.message)
    nav(`/g/${(data as Group).id}`)
  }
  async function removeGroup(g: Group) {
    if (!(await ask('Se borran sus partidos, jugadas y ranking. No se puede deshacer.', { title: `¿Eliminar "${g.name}"?`, ok: 'Eliminar', danger: true }))) return
    setBusy(true); setErr('')
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) setErr(error.message)
    await load(); setBusy(false)
  }
  async function createCustom(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    let logo: string | null = null
    try { if (logoFile) logo = await uploadCrest(logoFile) } catch (x) { setBusy(false); return setErr((x as Error).message) }
    const { data, error } = await supabase.from('groups')
      .insert({ name: f.name, logo, fee: f.fee || null, pay_alias: f.pay_alias || groups[0]?.pay_alias || null, commission_pct: Math.min(100, Math.max(0, Number(f.pct || pct) || 0)) })
      .select().single()
    setBusy(false)
    if (error) return setErr(error.message)
    nav(`/g/${(data as Group).id}`)
  }

  const groupRow = (g: Group) => (
    <div key={g.id} className="card">
      <div className="row">
        <span className="who">{g.logo ? <img className="crest" style={{ width: 34, height: 34 }} src={g.logo} alt="" /> : <span className="pos">?</span>}
          <span><strong>{g.name}{g.round ? ` · Fecha ${g.round}` : ''}</strong><div className="small muted" style={{ margin: 0 }}>{LEAGUES.find((l) => l.id === g.league_id)?.name ?? 'Campeonato propio'}</div></span></span>
        <button className={`toggle ${g.active ? 'on' : ''}`} disabled={busy} onClick={() => setActive(g, !g.active)}>{g.active ? 'Visible' : 'Oculto'}</button>
      </div>
      <div className="actions">
        <Link to={`/g/${g.id}`} className="link">Administrar ›</Link>
        {g.finish_notified && g.league_id && !groups.some((x) => x.league_id === g.league_id && x.season === g.season && (x.round ?? 0) > (g.round ?? 0)) && (
          <button className="ghost small" disabled={busy} onClick={() => createNext(g)}>Crear la fecha siguiente a mano</button>
        )}
        <button className="danger" disabled={busy} onClick={() => removeGroup(g)}>Eliminar</button>
      </div>
    </div>
  )

  return (
    <>
      <h2 style={{ marginTop: 8 }}>Administración</h2>
      <div className="seg" style={{ overflowX: "auto" }}>
        <button className={tab === 'resumen' ? 'on' : ''} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'solicitudes' ? 'on' : ''} onClick={() => setTab('solicitudes')}>Solicitudes{reqs.length > 0 && <span className="n">{reqs.length}</span>}</button>
        <button className={tab === 'campeonatos' ? 'on' : ''} onClick={() => setTab('campeonatos')}>Campeonatos</button>
        <button className={tab === 'equipos' ? 'on' : ''} onClick={() => setTab('equipos')}>Equipos</button>
        <button className={tab === 'usuarios' ? 'on' : ''} onClick={() => setTab('usuarios')}>Usuarios</button>
      </div>

      {tab === 'resumen' && <Resumen />}
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'equipos' && <Equipos />}
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
            <div className="eyebrow">Valor y ganancia</div>
            <div className="row" style={{ marginTop: 8 }}>
              <span>Valor de la jugada ($)</span>
              <span><input className="pct" style={{ width: 90 }} type="number" min={0} inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value)} /></span>
            </div>
            <p className="small muted" style={{ margin: '2px 0 6px' }}>Con valor 0 los campeonatos son amistosos: sin pago, sin pozo y sin premio. Cuando le pongas un valor, pasan a ser con premio.</p>
            <div className="row" style={{ marginTop: 8 }}>
              <span>Porcentaje que te queda de cada pozo</span>
              <span><input className="pct" type="number" min={0} max={100} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /> %</span>
            </div>
            <p className="small muted">Vale para cada fecha: se descuenta del total recaudado y el resto es el premio. Se aplica a las fechas que todavía no empezaron, y las siguientes se abren con el mismo valor y porcentaje. No cambia las fechas en juego ni las ya terminadas. Ej: 4 jugadores × $5.000 con 10% → pozo $18.000 y te quedan $2.000.</p>
            <button className="primary small" onClick={savePct}>Guardar</button>
            {pctMsg && <span className="small muted"> {pctMsg}</span>}
          </div>
          {err && <p className="msg">{err}</p>}
          <h3>Fechas en juego</h3>
          {groups.filter((g) => !g.finish_notified).length === 0 && <p className="empty">No tenés ninguna fecha en juego. Agregá una liga acá abajo.</p>}
          {groups.filter((g) => !g.finish_notified).map(groupRow)}
          {groups.some((g) => g.finish_notified) && (
            <>
              <h3>Fechas terminadas</h3>
              {groups.filter((g) => g.finish_notified).map(groupRow)}
            </>
          )}
          <h3>Agregar una liga</h3>
          <p className="small muted">Trae sola la fecha que viene, con partidos y escudos. Cuando termina, se abre sola la siguiente. Las que ya tenés no aparecen acá.</p>
          {LEAGUES.filter((l) => !groups.some((g) => g.league_id === l.id)).map((l) => (
            <div key={l.id} className="card row">
              <strong>{l.name}</strong>
              <button className="primary small" disabled={busy} onClick={() => toggleLeague(l)}>Agregar</button>
            </div>
          ))}
          {!creating ? <button className="ghost" onClick={() => setCreating(true)}>Crear campeonato propio (armo equipos y partidos)</button> : (
            <form className="card" onSubmit={createCustom}>
              <h3>Campeonato propio</h3>
              <label className="lbl">Nombre del campeonato</label>
              <input placeholder="Ej: Copa de los Amigos" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
              <label className="lbl">Logo del campeonato (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
              <label className="lbl">Valor de la jugada</label>
              <input placeholder="Ej: $5000" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
              <label className="lbl">Tu porcentaje del pozo (%)</label>
              <input type="number" min={0} max={100} inputMode="decimal" placeholder="Ej: 10" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />
              <label className="lbl">Tu alias para recibir las transferencias</label>
              <input placeholder="Alias" value={f.pay_alias} onChange={(e) => setF({ ...f, pay_alias: e.target.value })} />
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

type Stats = { users: number; users_7d: number; users_today: number; players: number; sent: number; pending: number; approved: number; rejected: number
  campeonatos: { id: string; name: string; logo: string | null; active: boolean; sent: number; approved: number; gross: number; mine: number }[] }

function Resumen() {
  const [s, setS] = useState<Stats | null | undefined>(undefined)
  useEffect(() => { supabase.rpc('admin_stats').then(({ data }) => setS((data as Stats) ?? null)) }, [])
  if (s === undefined) return <p className="muted">Cargando…</p>
  if (s === null) return <p className="empty">No hay datos todavía.</p>
  const gross = s.campeonatos.reduce((a, c) => a + Number(c.gross), 0)
  const mine = s.campeonatos.reduce((a, c) => a + Number(c.mine), 0)
  const K = ({ n, l, c }: { n: string | number; l: string; c?: string }) => (
    <div className="card kpi"><div className="num" style={c ? { color: c } : undefined}>{n}</div><div className="eyebrow">{l}</div></div>
  )
  return (
    <>
      <div className="kpis">
        <K n={s.users} l="Usuarios registrados" />
        <K n={`+${s.users_7d}`} l="Nuevos (7 días)" />
        <K n={s.players} l="Jugaron alguna vez" />
        <K n={s.sent} l="Jugadas enviadas" />
        <K n={s.pending} l="Por confirmar" c={s.pending ? 'var(--gold)' : undefined} />
        <K n={s.approved} l="Pagadas" c="var(--acc)" />
        <K n={money(gross)} l="Recaudado" />
        <K n={money(mine)} l="Tu ganancia" c="var(--gold)" />
      </div>
      <h3>Por campeonato</h3>
      {s.campeonatos.map((c) => (
        <div key={c.id} className="card">
          <div className="row">
            <span className="who">{c.logo && <img className="crest" style={{ width: 28, height: 28 }} src={c.logo} alt="" />}<strong>{c.name}</strong></span>
            <span className={`pill ${c.active ? 's-approved' : 's-rejected'}`} style={{ margin: 0 }}>{c.active ? 'Activo' : 'Apagado'}</span>
          </div>
          <div className="small muted">{c.sent} jugadas · {c.approved} pagadas · recaudado {money(Number(c.gross))} · tuyo <strong style={{ color: 'var(--gold)' }}>{money(Number(c.mine))}</strong></div>
        </div>
      ))}
    </>
  )
}

type U = { id: string; name: string; phone: string; alias: string; avatar_url: string | null; created_at: string; jugadas: number; pagadas: number }

function Usuarios() {
  const [l, setL] = useState<U[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { supabase.rpc('admin_users').then(({ data }) => setL((data as U[]) ?? [])) }, [])
  if (l === null) return <p className="muted">Cargando…</p>
  const t = q.trim().toLowerCase()
  const list = l.filter((u) => !t || `${u.name} ${u.phone} ${u.alias}`.toLowerCase().includes(t))
  return (
    <>
      <label className="lbl">Buscar usuario</label>
      <input placeholder={`Nombre, alias o teléfono (${l.length} usuarios)`} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((u) => (
        <div key={u.id} className="card">
          <div className="row">
            <span className="who"><Avatar url={u.avatar_url} name={u.name || '?'} size={38} />
              <span><strong>{u.name || 'Sin nombre'}</strong><div className="small muted" style={{ margin: 0 }}>Alias {u.alias || '—'} · desde {new Date(u.created_at).toLocaleDateString('es-AR')}</div></span></span>
            <span className="small muted" style={{ textAlign: 'right' }}>{u.jugadas} jugadas<br />{u.pagadas} pagadas</span>
          </div>
          {u.phone && <a className="link small" href={`https://wa.me/${u.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp {u.phone}</a>}
        </div>
      ))}
    </>
  )
}

type T = { id: string; name: string; logo: string | null }

function Equipos() {
  const [teams, setTeams] = useState<T[] | null>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const { data } = await supabase.from('teams').select('*').order('name')
    setTeams((data as T[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])
  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const logo = file ? await uploadCrest(file) : null
      const { error } = await supabase.from('teams').insert({ name: name.trim(), logo })
      if (error) throw new Error(error.message)
      setName(''); setFile(null); (document.getElementById('crest-file') as HTMLInputElement | null)?.setAttribute('value', '')
      await load()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  async function remove(t: T) {
    if (!(await ask(`Se borra ${t.name} de tu lista de equipos.`, { title: '¿Borrar equipo?', ok: 'Borrar', danger: true }))) return
    await supabase.from('teams').delete().eq('id', t.id)
    load()
  }
  return (
    <>
      <p className="small muted">Cargá tus equipos una vez, con su escudo, y después los elegís al armar los partidos de un campeonato propio.</p>
      <form className="card" onSubmit={add}>
        <label className="lbl">Nombre del equipo</label>
        <input placeholder="Ej: Los Pumas" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="lbl">Escudo (imagen)</label>
        <input id="crest-file" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button className="primary" disabled={busy}>{busy ? 'Subiendo…' : 'Agregar equipo'}</button>
        {err && <p className="msg">{err}</p>}
      </form>
      {teams === null ? <p className="muted">Cargando…</p> : teams.length === 0 ? <p className="empty">Todavía no cargaste equipos.</p> : teams.map((t) => (
        <div key={t.id} className="card row">
          <span className="who">{t.logo ? <img className="crest" style={{ width: 34, height: 34 }} src={t.logo} alt="" /> : <span className="pos">?</span>}<strong>{t.name}</strong></span>
          <button className="danger" onClick={() => remove(t)}>Borrar</button>
        </div>
      ))}
    </>
  )
}
