import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEMO, supabase, statusLabel, type Group, type Entry } from '../supabase'

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [mine, setMine] = useState<(Entry & { group: { name: string; code: string } })[]>([])
  const [f, setF] = useState({ name: '', fee: '', pay_alias: '' })
  const [err, setErr] = useState('')
  const nav = useNavigate()

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const { data } = await supabase.from('groups').select('*').eq('owner_id', uid!).order('created_at', { ascending: false })
    setGroups((data as Group[]) ?? [])
    const e = await supabase.from('entries').select('*, group:groups(name, code)').eq('user_id', uid!)
    setMine((e.data as never) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: f.name, fee: f.fee || null, pay_alias: f.pay_alias || null })
      .select()
      .single()
    if (error) return setErr(error.message)
    nav(`/g/${(data as Group).id}`)
  }

  return (
    <>
      {DEMO && <button className="ghost" onClick={() => nav('/p/DEMO12')}>DEMO: abrir el link de participante del prode</button>}
      <h2>Mis jugadas</h2>
      {mine.length === 0 && <p className="muted">Entrá con el link que te pasó el organizador para anotarte en un prode.</p>}
      {mine.map((e) => (
        <Link key={e.id} to={`/p/${e.group.code}`} className="card row">
          <strong>{e.group.name}</strong>
          <span className="muted small">{e.submitted_at ? statusLabel[e.status] : 'Sin enviar'}</span>
        </Link>
      ))}
      <h2>Prodes que organizo</h2>
      {groups.length === 0 && <p className="muted">Todavía no creaste ningún prode.</p>}
      {groups.map((g) => (
        <Link key={g.id} to={`/g/${g.id}`} className="card row">
          <strong>{g.name}</strong>
          <span className="muted">{g.fee ?? ''}</span>
        </Link>
      ))}
      <form className="card" onSubmit={create}>
        <h3>Crear un prode nuevo</h3>
        <input placeholder="Nombre (ej: Prode Liga Profesional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input placeholder="Valor de la jugada (ej: $5000)" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
        <input placeholder="Tu alias para recibir la transferencia" value={f.pay_alias} onChange={(e) => setF({ ...f, pay_alias: e.target.value })} />
        <p className="small muted">El prode se cierra solo cuando cargues el resultado del último partido.</p>
        <button className="primary">Crear</button>
        {err && <p className="msg">{err}</p>}
      </form>
    </>
  )
}
