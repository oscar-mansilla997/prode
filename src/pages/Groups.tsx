import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ShareButton, { appUrl } from '../Share'
import { PushBanner } from '../PushPrompt'
import { isFree, money, supabase, statusLabel, type Entry, type Prode } from '../supabase'

export default function Groups() {
  const [prodes, setProdes] = useState<Prode[] | null>(null)
  const [mine, setMine] = useState<Record<string, Entry>>({})

  const load = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id
    const [p, e] = await Promise.all([
      supabase.rpc('list_prodes'),
      supabase.from('entries').select('*, group:groups(id, code)').eq('user_id', uid!),
    ])
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
      <ShareButton text='Sumate a La Cabra, el prode de fútbol. Armá tu jugada y competí por el pozo de cada fecha:' url={appUrl()} label='Invitar amigos por WhatsApp' ghost={false} />
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
    </>
  )
}
