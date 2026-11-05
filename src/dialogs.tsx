import { useEffect, useState } from 'react'

type Req = { title?: string; message: string; ok: string; cancel?: string; danger?: boolean; resolve: (v: boolean) => void }
let push: ((r: Req) => void) | null = null

/** Reemplaza al confirm() del navegador por una ventana propia de la app. */
export function ask(message: string, o: { title?: string; ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.confirm(message))
    push({ message, title: o.title, ok: o.ok ?? 'Aceptar', cancel: o.cancel ?? 'Cancelar', danger: o.danger, resolve })
  })
}
/** Reemplaza al alert(): un aviso con un solo botón. */
export function notice(message: string, title?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) { window.alert(message); return resolve(true) }
    push({ message, title, ok: 'Entendido', resolve })
  })
}

let pushToast: ((m: string) => void) | null = null
/** Aviso chico que aparece unos segundos y se va solo. */
export function toast(message: string) { pushToast?.(message) }

/** Copia al portapapeles y avisa con un cartelito. */
export async function copyText(text: string, what = 'Copiado') {
  try { await navigator.clipboard.writeText(text) }
  catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select()
    try { document.execCommand('copy') } catch { /* sin permiso */ }
    t.remove()
  }
  toast(`${what} ✓`)
}

export function Dialogs() {
  const [cur, setCur] = useState<Req | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { push = setCur; return () => { push = null } }, [])
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    pushToast = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 2200) }
    return () => { pushToast = null; clearTimeout(t) }
  }, [])
  const toastEl = msg ? <div className="toast">{msg}</div> : null
  if (!cur) return toastEl
  const close = (v: boolean) => { cur.resolve(v); setCur(null) }
  return (
    <>
    {toastEl}
    <div className="modal-bg" onClick={() => close(false)}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {cur.title && <h2>{cur.title}</h2>}
        <p style={{ margin: '8px 0 18px' }}>{cur.message}</p>
        <div className="actions" style={{ justifyContent: 'center' }}>
          {cur.cancel && <button className="ghost small" onClick={() => close(false)}>{cur.cancel}</button>}
          <button className={cur.danger ? 'danger' : 'primary small'} style={cur.danger ? { background: 'var(--danger)', color: '#fff', border: 0 } : undefined} onClick={() => close(true)}>{cur.ok}</button>
        </div>
      </div>
    </div>
    </>
  )
}
