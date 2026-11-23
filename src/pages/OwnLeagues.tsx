import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Crest } from '../components'
import { ask, toast } from '../dialogs'
import { IMG_HINT, uploadCrest } from '../upload'
import { crestFor } from './AutoImport'

type T = { id: string; name: string; logo: string | null }
type League = { id: string; name: string; logo: string | null; own_league_teams: { team: T | null }[] }

export default function OwnLeagues() {
  const [leagues, setLeagues] = useState<League[] | null>(null)
  const [teams, setTeams] = useState<T[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([
      supabase.from('own_leagues').select('id, name, logo, own_league_teams(team:teams(id, name, logo))').order('created_at', { ascending: false }),
      supabase.from('teams').select('id, name, logo').order('name'),
    ])
    setLeagues((l.data as unknown as League[]) ?? [])
    setTeams((t.data as T[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const lg = logo ? await uploadCrest(logo) : null
      const { data, error } = await supabase.from('own_leagues').insert({ name: name.trim(), logo: lg }).select().single()
      if (error) throw new Error(error.message)
      setName(''); setLogo(null); setCreating(false); setOpen((data as League).id)
      await load()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  async function removeLeague(l: League) {
    if (!(await ask(`Se borra la liga ${l.name}. Los equipos siguen guardados en tu lista y los partidos ya cargados no se tocan.`, { title: '¿Borrar liga?', ok: 'Borrar', danger: true }))) return
    await supabase.from('own_leagues').delete().eq('id', l.id)
    load()
  }

  return (
    <>
      <p className="small muted">Armá tus propias ligas (ej: Liga Ischilín) y elegí qué equipos juegan. Después, al cargar partidos en un prode, elegís la liga y solo te aparecen sus equipos.</p>
      {!creating ? <button className="primary" onClick={() => setCreating(true)}>+ Crear una liga</button> : (
        <form className="card" onSubmit={create}>
          <h3>Nueva liga</h3>
          <label className="lbl">Nombre de la liga</label>
          <input placeholder="Ej: Liga Ischilín" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="lbl">Logo de la liga (opcional)</label>
          <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          <p className="small muted">{IMG_HINT}</p>
          <button className="primary" disabled={busy}>{busy ? 'Creando…' : 'Crear liga'}</button>
          <button type="button" className="link" onClick={() => setCreating(false)}>Cancelar</button>
          {err && <p className="msg">{err}</p>}
        </form>
      )}
      {leagues === null ? <p className="muted">Cargando…</p> : leagues.length === 0 ? <p className="empty">Todavía no armaste ninguna liga.</p> : leagues.map((l) => (
        <div key={l.id} className="card">
          <div className="row">
            <span className="who">{l.logo ? <img className="crest" style={{ width: 34, height: 34 }} src={l.logo} alt="" /> : <span className="pos">?</span>}
              <span><strong>{l.name}</strong><div className="small muted" style={{ margin: 0 }}>{l.own_league_teams.length} equipos</div></span></span>
          </div>
          <button className="cta" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Cerrar' : 'Equipos de la liga'}</button>
          {open === l.id && <LeagueTeams league={l} all={teams} reload={load} />}
          <div className="sub"><button className="danger small" onClick={() => removeLeague(l)}>Eliminar liga</button></div>
        </div>
      ))}
    </>
  )
}

function LeagueTeams({ league, all, reload }: { league: League; all: T[]; reload: () => void }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const mine = league.own_league_teams.map((x) => x.team).filter(Boolean) as T[]
  const known = all.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const n = name.trim()
    if (!n) return
    if (mine.some((t) => t.name.toLowerCase() === n.toLowerCase())) return setErr('Ese equipo ya está en la liga.')
    setBusy(true)
    try {
      let t = known
      if (!t) {
        const logo = file ? await uploadCrest(file) : await crestFor(n)
        const { data, error } = await supabase.from('teams').insert({ name: n, logo }).select().single()
        if (error) throw new Error(error.message)
        t = data as T
      }
      const { error } = await supabase.from('own_league_teams').insert({ league_id: league.id, team_id: t.id })
      if (error) throw new Error(error.message)
      setName(''); setFile(null); toast('Equipo agregado a la liga')
      reload()
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  async function remove(t: T) {
    await supabase.from('own_league_teams').delete().eq('league_id', league.id).eq('team_id', t.id)
    reload()
  }
  return (
    <div style={{ marginTop: 10 }}>
      <form onSubmit={add}>
        <label className="lbl">Sumar un equipo a la liga</label>
        <datalist id={`eq-${league.id}`}>{all.filter((t) => !mine.some((m) => m.id === t.id)).map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <input list={`eq-${league.id}`} placeholder="Escribí el nombre del equipo" value={name} onChange={(e) => setName(e.target.value)} />
        {name.trim() && !known && (
          <>
            <label className="lbl">Escudo (opcional, si no lo encuentra solo)</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="small muted">{IMG_HINT}</p>
          </>
        )}
        {name.trim() && known && <p className="small muted">Es uno de tus equipos guardados: se usa con su escudo.</p>}
        <button className="primary" disabled={busy}>{busy ? 'Agregando…' : 'Agregar a la liga'}</button>
        {err && <p className="msg">{err}</p>}
      </form>
      {mine.length === 0 ? <p className="small muted">Todavía no tiene equipos.</p> : mine.map((t) => (
        <div key={t.id} className="row" style={{ marginTop: 8 }}>
          <span className="who"><Crest url={t.logo} /><strong>{t.name}</strong></span>
          <button className="link" onClick={() => remove(t)}>Quitar</button>
        </div>
      ))}
    </div>
  )
}
