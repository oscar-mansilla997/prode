import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO, money, supabase, statusLabel, type Entry, type Group, type Prode } from '../supabase'
import { LEAGUES, importNext } from './AutoImport'

export default function Groups() {
  const [prodes, setProdes] = useState<Prode[]>([])
  const [mine, setMine] = useState<Record<string, Entry>>({})
  const [organized, setOrganized] = useState<Group[]>([])
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', fee: '', pay_alias: '', pct: '', league: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const [p, e, g] = await Promise.all([
      supabase.rpc('list_prodes'),
      supabase.from('entries').select('*, group:groups(id, code)').eq('user_id', uid!),
      supabase.from('groups').select('*').eq('owner_id', uid!).order('created_at', { ascending: false }),
    ])
    setProdes(((p.data as Prode[]) ?? []).map((x) => ({ ...x, matches: Number(x.matches), players: Number(x.players), pot: Number(x.pot) })))
    const map: Record<string, Entry> = {}
    for (const row of ((e.data as unknown as (Entry & { group: { code: string } })[]) ?? [])) map[row.group.code] = row
    setMine(map)
    setOrganized((g.data as Group[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function setActive(g: Group, active: boolean) {
    setBusy(true)
    await supabase.from('groups').update({ active }).eq('id', g.id)
    await load()
    setBusy(false)
  }

  async function toggleLeague(l: { id: number; name: string }, g?: Group) {
    if (g) return setActive(g, !g.active)
    setBusy(true); setErr('')
    const base = organized[0]
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: `Prode ${l.name}`, fee: base?.fee ?? null, pay_alias: base?.pay_alias ?? null, commission_pct: base?.commission_pct ?? 0 })
      .select().single()
    if (error) { setBusy(false); return setErr(error.message) }
    try { await importNext((data as Group).id, l.id) } catch { /* se reintenta al abrir el prode */ }
    await load()
    setBusy(false)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: f.name, fee: f.fee || null, pay_alias: f.pay_alias || null, commission_pct: Math.min(100, Math.max(0, Number(f.pct) || 0)) })
      .select()
      .single()
    if (error) { setBusy(false); return setErr(error.message) }
    if (f.league) { try { await importNext((data as Group).id, +f.league) } catch { /* se puede reintentar adentro */ } }
    setBusy(false)
    nav(`/g/${(data as Group).id}`)
  }

  return (
    <>
      <h2>Elegí tu prode</h2>
      {prodes.length === 0 && <p className="muted">Todavía no hay prodes. ¡Creá el primero abajo!</p>}
      <div className="prodes">
        {prodes.map((p) => {
          const m = mine[p.code]
          return (
            <Link key={p.id} to={`/p/${p.code}`} className="card prode">
              {p.logo ? <img className="logo" src={p.logo} alt="" /> : <div className="logo ball">⚽</div>}
              <strong>{p.name}</strong>
              <span className="pozo">Pozo {money(p.pot)}</span>
              <span className="small muted">{p.fee ? `Jugada ${p.fee}` : 'Gratis'}</span>
              <span className="small muted">{p.players} jugando · {p.matches} partidos</span>
              {m && <span className={`pill s-${m.status}`}>{m.submitted_at ? statusLabel[m.status] : 'Falta enviar'}</span>}
            </Link>
          )
        })}
      </div>

      <h2>Mis ligas</h2>
      <p className="small muted">Prendé las ligas que querés que aparezcan para jugar. Al prender una nueva, trae sola los partidos y el logo.</p>
      {LEAGUES.map((l) => {
        const g = organized.find((x) => x.league_id === l.id)
        return (
          <div key={l.id} className="card row">
            <span>{g ? <Link to={`/g/${g.id}`}><strong>{l.name}</strong> <span className="muted small">Administrar ›</span></Link> : <strong>{l.name}</strong>}</span>
            <button className={`toggle ${g?.active ? 'on' : ''}`} disabled={busy} onClick={() => toggleLeague(l, g)}>{g?.active ? 'Activa' : 'Apagada'}</button>
          </div>
        )
      })}
      {organized.filter((g) => !LEAGUES.some((l) => l.id === g.league_id)).map((g) => (
        <div key={g.id} className="card row">
          <Link to={`/g/${g.id}`}><strong>{g.name}</strong> <span className="muted small">Administrar ›</span></Link>
          <button className={`toggle ${g.active ? 'on' : ''}`} disabled={busy} onClick={() => setActive(g, !g.active)}>{g.active ? 'Activa' : 'Apagada'}</button>
        </div>
      ))}
      {!creating ? (
        <button className="ghost" onClick={() => setCreating(true)}>＋ Crear un prode nuevo</button>
      ) : (
        <form className="card" onSubmit={create}>
          <h3>Crear un prode nuevo</h3>
          <input placeholder="Nombre (ej: Prode Liga Profesional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <label className="small muted">Torneo (trae los partidos y el logo solo)</label>
          <select value={f.league} onChange={(e) => setF({ ...f, league: e.target.value })}>
            <option value="">Cargar partidos a mano</option>
            {LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input placeholder="Valor de la jugada (ej: $5000)" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
          <input type="number" min={0} max={100} inputMode="decimal" placeholder="Tu porcentaje del pozo (ej: 10)" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} />
          <input placeholder="Tu alias para recibir la transferencia" value={f.pay_alias} onChange={(e) => setF({ ...f, pay_alias: e.target.value })} />
          <p className="small muted">El prode se cierra solo cuando cargues el resultado del último partido.</p>
          <button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear'}</button>
          <button type="button" className="link" onClick={() => setCreating(false)}>Cancelar</button>
          {err && <p className="msg">{err}</p>}
        </form>
      )}
      {err && !creating && <p className="msg">{err}</p>}
      {DEMO && <p className="small muted">Modo demo</p>}
    </>
  )
}
