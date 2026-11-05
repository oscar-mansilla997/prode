import { useState } from 'react'
import { supabase, type Profile as P } from '../supabase'
import { Avatar } from '../components'

// Reduce la foto a 256px para que suba rápido
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const s = 256 / Math.min(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const w = img.width * s, h = img.height * s
  x.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85))
}

export default function Profile({ profile, onSaved }: { profile: P; onSaved: () => void }) {
  const [f, setF] = useState({ name: profile.name, phone: profile.phone, alias: profile.alias, birth_date: profile.birth_date ?? '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('profiles').update({ ...f, birth_date: f.birth_date || null }).eq('id', profile.id)
    setMsg(error ? error.message : 'Guardado ✓')
    if (!error) onSaved()
  }

  async function photo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg('')
    try {
      const blob = await shrink(file)
      const path = `${profile.id}/avatar.jpg`
      const up = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + `?v=${Date.now()}`
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
      if (error) throw error
      onSaved()
    } catch (err) {
      setMsg((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <>
      <h2>Mi perfil</h2>
      <div className="card" style={{ textAlign: 'center' }}>
        <Avatar url={profile.avatar_url} name={profile.name || '?'} size={96} />
        <div>
          <label className="link" style={{ cursor: 'pointer' }}>
            {busy ? 'Subiendo…' : 'Cambiar foto'}
            <input type="file" accept="image/*" hidden onChange={photo} disabled={busy} />
          </label>
        </div>
      </div>
      <form className="card" onSubmit={save}>
        <input placeholder="Nombre y apellido" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input type="tel" placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
        <input placeholder="Alias" value={f.alias} onChange={(e) => setF({ ...f, alias: e.target.value })} required />
        <label className="small muted">Fecha de nacimiento</label>
        <input type="date" value={f.birth_date} onChange={(e) => setF({ ...f, birth_date: e.target.value })} required />
        <button className="primary">Guardar</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
      <button className="ghost" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </>
  )
}
