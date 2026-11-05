import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { money, supabase } from './supabase'
import { copyText } from './dialogs'
import { Avatar, Icon } from './components'

type N = { id: string; code: string | null; text: string; read: boolean; created_at: string; kind?: string | null; amount?: number | null; payload?: { name: string; alias: string; phone: string; avatar_url: string | null; amount: number }[] | null }

export default function Bell() {
  const [list, setList] = useState<N[]>([])
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<string[]>([])
  const [view, setView] = useState<N | null>(null)
  const nav = useNavigate()

  const pull = useCallback(async () => {
    try {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(20)
      setList((data as N[]) ?? [])
    } catch { /* sin avisos */ }
  }, [])
  useEffect(() => {
    pull()
    const t = setInterval(pull, 20000)
    return () => clearInterval(t)
  }, [pull])

  const unread = list.filter((n) => !n.read).length
  const win = list.find((n) => n.kind === 'win' && !n.read && !shown.includes(n.id))
  const adm = view ?? list.find((n) => n.kind === 'admin' && n.payload && !n.read && !shown.includes(n.id) && !win)
  async function closeAdm() {
    if (!adm) return
    setShown((x) => [...x, adm.id]); setView(null)
    await supabase.from('notifications').update({ read: true }).eq('id', adm.id)
    pull()
  }
  async function closeWin() {
    if (!win) return
    setShown((x) => [...x, win.id])
    await supabase.from('notifications').update({ read: true }).eq('id', win.id)
    pull()
  }
  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && unread) {
      await supabase.from('notifications').update({ read: true }).eq('read', false)
      setTimeout(pull, 1500)
    }
  }
  return (
    <span className="bell">
      {adm && !win && (
        <div className="modal-bg" onClick={closeAdm}>
          <div className="modal win" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Campeonato terminado</div>
            <h3 style={{ margin: '6px 0' }}>{adm.text}</h3>
            <p className="small muted">Transferí el premio a:</p>
            {(adm.payload ?? []).map((w, i) => (
              <div key={i} className="card" style={{ textAlign: 'left' }}>
                <div className="who"><Avatar url={w.avatar_url} name={w.name} size={46} />
                  <span><strong>{w.name}</strong><div className="small" style={{ margin: 0, color: 'var(--gold)', fontWeight: 700 }}>{money(Number(w.amount))}</div></span></div>
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="small" style={{ margin: 0 }}>Alias: <strong className="code">{w.alias || '—'}</strong></span>
                  {w.alias && <button className="link" onClick={() => copyText(w.alias, 'Alias copiado')}>Copiar</button>}
                </div>
                {w.phone && <a className="link small" href={`https://wa.me/${w.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp {w.phone}</a>}
              </div>
            ))}
            <button className="primary" onClick={closeAdm}>Listo</button>
          </div>
        </div>
      )}
      {win && (
        <div className="modal-bg" onClick={closeWin}>
          <div className="modal win" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Campeonato terminado</div>
            <h2 style={{ margin: '6px 0' }}>¡Ganaste!</h2>
            <p className="small muted">{win.text}</p>
            <div className="eyebrow" style={{ marginTop: 10 }}>Tu premio</div>
            <div className="big" style={{ color: 'var(--gold)' }}>{money(Number(win.amount ?? 0))}</div>
            <p className="small muted">El organizador te va a transferir el premio. Podés coordinar con él por WhatsApp.</p>
            <button className="primary" onClick={closeWin}>Genial</button>
          </div>
        </div>
      )}
      <button className="link" onClick={toggle} aria-label="Avisos">{Icon.bell}{unread > 0 && <b className="badge">{unread}</b>}</button>
      {open && (
        <div className="bellbox">
          {list.length === 0 && <p className="small muted">Sin avisos todavía.</p>}
          {list.map((n) => (
            <div key={n.id} className={`aviso ${n.read ? '' : 'new'}`} onClick={() => { setOpen(false); if (n.kind === 'admin' && n.payload) setView(n); else if (n.code) nav(`/p/${n.code}`) }}>
              {n.text}{n.kind === 'win' && n.amount ? <strong style={{ color: 'var(--gold)' }}> {money(Number(n.amount))}</strong> : null}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
