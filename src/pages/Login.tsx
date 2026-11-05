import { useState } from 'react'
import { DEMO, supabase } from '../supabase'

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [f, setF] = useState({ name: '', phone: '', alias: '', birth_date: '', email: '', password: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
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
        <h1>⚽ Prode</h1>
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
        <input type="password" placeholder="Contraseña (mín. 6)" minLength={6} value={f.password} onChange={set('password')} required />
        <button className="primary" disabled={busy}>{mode === 'in' ? 'Ingresar' : 'Crear cuenta'}</button>
        {msg && <p className="msg">{msg}</p>}
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? '¿No tenés cuenta? Registrate' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  )
}
