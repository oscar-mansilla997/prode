import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { money, supabase } from './supabase'
import { Icon } from './components'

type N = { id: string; code: string | null; text: string; read: boolean; created_at: string; kind?: string | null; amount?: number | null }

export default function Bell() {
  const [list, setList] = useState<N[]>([])
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<string[]>([])
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
            <div key={n.id} className={`aviso ${n.read ? '' : 'new'}`} onClick={() => { setOpen(false); if (n.code) nav(`/p/${n.code}`) }}>
              {n.text}{n.kind === 'win' && n.amount ? <strong style={{ color: 'var(--gold)' }}> {money(Number(n.amount))}</strong> : null}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
