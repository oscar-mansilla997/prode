import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushActive, pushSupported } from './push'
import { toast } from './dialogs'

/** Cartel para activar los avisos en el celular (aparece hasta que se active o se descarte). */
export function PushBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== 'default' || localStorage.getItem('push-no') === '1') return
    pushActive().then((a) => setShow(!a))
  }, [])
  if (!show) return null
  return (
    <div className="card win" style={{ marginTop: 8 }}>
      <strong>Activá los avisos</strong>
      <p className="small muted" style={{ margin: '4px 0 8px' }}>Enterate en el celular cuando te aprueban la jugada o ganás, sin abrir la app.</p>
      <div className="actions">
        <button className="primary small" onClick={async () => { const e = await enablePush(); if (e) toast(e); else { toast('Avisos activados ✓'); setShow(false) } }}>Activar avisos</button>
        <button className="link" onClick={() => { localStorage.setItem('push-no', '1'); setShow(false) }}>Ahora no</button>
      </div>
    </div>
  )
}

/** Interruptor para el perfil. */
export function PushToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { pushActive().then(setOn) }, [])
  if (!pushSupported()) return <div className="card"><h3>Avisos en el celular</h3><p className="small muted">Este navegador no los permite. En iPhone, agregá primero la app a la pantalla de inicio.</p></div>
  return (
    <div className="card">
      <div className="row">
        <div><h3 style={{ margin: 0 }}>Avisos en el celular</h3><p className="small muted" style={{ margin: '4px 0 0' }}>Te llegan aunque la app esté cerrada.</p></div>
        <button className={`toggle ${on ? 'on' : ''}`} disabled={on === null} onClick={async () => {
          if (on) { await disablePush(); setOn(false); toast('Avisos desactivados'); return }
          const e = await enablePush(); if (e) toast(e); else { setOn(true); toast('Avisos activados ✓') }
        }}>{on ? 'Activados' : 'Desactivados'}</button>
      </div>
    </div>
  )
}
