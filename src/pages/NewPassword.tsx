import { useState } from 'react'
import Brand from '../Brand'
import { supabase } from '../supabase'

export default function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg(error.message)
    onDone()
  }
  return (
    <div className="screen center">
      <form className="card" onSubmit={save}>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 14px' }}><Brand size={64} /></div>
        <h3>Elegí tu contraseña nueva</h3>
        <label className="lbl">Contraseña nueva (mínimo 8 caracteres)</label>
        <input type="password" placeholder="Contraseña nueva" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
        <button className="primary" disabled={busy}>Guardar y entrar</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    </div>
  )
}
