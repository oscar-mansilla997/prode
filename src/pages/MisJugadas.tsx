import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { statusLabel, supabase, type Entry } from '../supabase'
import { PredList } from '../components'

type E = Entry & { group: { id: string; name: string; logo: string | null; code: string } }

export default function MisJugadas() {
  const [list, setList] = useState<E[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    ;(async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id
      const { data } = await supabase.from('entries').select('*, group:groups(id, name, logo, code)').eq('user_id', uid!).order('created_at', { ascending: false })
      const l = (data as unknown as E[]) ?? []
      setList(l)
      if (l[0]) setOpen(l[0].id)
    })()
  }, [])
  return (
    <>
      <h2 style={{ marginTop: 8 }}>Mis jugadas</h2>
      {list === null ? <p className="muted">Cargando…</p> : list.length === 0 ? (
        <p className="empty">Todavía no jugaste ningún campeonato.<br /><Link className="link" to="/">Ver campeonatos</Link></p>
      ) : list.map((e) => (
        <div key={e.id} className="card">
          <div className="row" onClick={() => setOpen(open === e.id ? null : e.id)} style={{ cursor: 'pointer' }}>
            <span className="who">
              {e.group.logo ? <img className="crest" style={{ width: 32, height: 32 }} src={e.group.logo} alt="" /> : <span>⚽</span>}
              <strong>{e.group.name}</strong>
            </span>
            <span className={`pill s-${e.status}`} style={{ margin: 0 }}>{e.submitted_at ? statusLabel[e.status] : 'Falta enviar'}</span>
          </div>
          {open === e.id && (
            <div style={{ marginTop: 10 }}>
              {!e.submitted_at ? <Link className="link" to={`/p/${e.group.code}`}>Completar y enviar jugada</Link>
                : <PredList groupId={e.group.id} entryId={e.id} showPoints={e.status === 'approved'} />}
              {e.submitted_at && e.status !== 'approved' && <p className="small muted">Los puntos se suman cuando el organizador confirme tu pago.</p>}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
