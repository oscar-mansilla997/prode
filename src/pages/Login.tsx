import Brand from '../Brand'
import { useState } from 'react'
import { DEMO, supabase } from '../supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in')
  const [f, setF] = useState({ name: '', phone: '', alias: '', birth_date: '', email: '', password: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: `${location.origin}${location.pathname}` })
      setBusy(false)
      return setMsg(error ? error.message : 'Listo. Te mandamos un mail con el link para elegir una contraseña nueva. Revisá también spam.')
    }
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
        : await supabase.auth.signUp({
            email: f.email,
            password: f.password,
            options: { data: { name: f.name, phone: f.phone, alias: f.alias, birth_date: f.birth_date } },
          })
    setBusy(false)
    if (error) setMsg(error.message)
    else if (mode === 'up') setMsg('Cuenta creada. Si te pide confirmar, revisá tu mail.')
  }

  return (
    <div className="screen center">
      <form className="card" onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 14px" }}><Brand size={64} /></div>
        {DEMO && (
          <div className="small muted">
            <strong>DEMO</strong> · contraseña <code>123456</code><br />
            <code>admin@demo.com</code> organizador<br />
            <code>juan@demo.com</code> / <code>maria@demo.com</code> participantes
          </div>
        )}
        {mode === 'up' && (
          <>
            <input placeholder="Nombre y apellido" value={f.name} onChange={set('name')} required />
            <input type="tel" placeholder="Número de teléfono" value={f.phone} onChange={set('phone')} required />
            <input placeholder="Tu alias (desde donde transferís)" value={f.alias} onChange={set('alias')} required />
            <label className="small muted">Fecha de nacimiento</label>
            <input type="date" value={f.birth_date} onChange={set('birth_date')} required />
          </>
        )}
        <input type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
        {mode !== 'forgot' && <input type="password" placeholder={mode === 'up' ? 'Contraseña (mín. 8)' : 'Contraseña'} minLength={mode === 'up' ? 8 : 6} value={f.password} onChange={set('password')} required />}
        {mode === 'forgot' && <p className="small muted">Escribí tu mail y te enviamos un link para elegir una contraseña nueva.</p>}
        <button className="primary" disabled={busy}>{mode === 'in' ? 'Ingresar' : mode === 'up' ? 'Crear cuenta' : 'Enviarme el mail'}</button>
        {msg && <p className="msg">{msg}</p>}
        <button type="button" className="link" onClick={() => { setMsg(''); setMode(mode === 'in' ? 'up' : 'in') }}>
          {mode === 'in' ? '¿No tenés cuenta? Registrate' : 'Ya tengo cuenta'}
        </button>
        {mode === 'in' && <div><button type="button" className="link" onClick={() => { setMsg(''); setMode('forgot') }}>Olvidé mi contraseña</button></div>}
      </form>
    </div>
  )
}
