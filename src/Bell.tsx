import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { Icon } from './components'

type N = { id: string; code: string | null; text: string; read: boolean; created_at: string }

export default function Bell() {
  const [list, setList] = useState<N[]>([])
  const [open, setOpen] = useState(false)
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
      <button className="link" onClick={toggle} aria-label="Avisos">{Icon.bell}{unread > 0 && <b className="badge">{unread}</b>}</button>
      {open && (
        <div className="bellbox">
          {list.length === 0 && <p className="small muted">Sin avisos todavía.</p>}
          {list.map((n) => (
            <div key={n.id} className={`aviso ${n.read ? '' : 'new'}`} onClick={() => { setOpen(false); if (n.code) nav(`/p/${n.code}`) }}>
              {n.text}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
