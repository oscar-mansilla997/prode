import { useEffect, useState } from 'react'
import { Crest } from './components'
import { searchTeamsWeb, type TeamOpt } from './pages/AutoImport'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Buscador de equipos: tus equipos guardados primero y, si no está, los de la fuente pública. Se elige tocando. */
export default function TeamField({ label, value, onText, onPick, saved, web = true }: {
  label: string; value: string; onText: (v: string) => void; onPick: (t: TeamOpt) => void; saved: TeamOpt[]; web?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<TeamOpt[]>([])
  const [busy, setBusy] = useState(false)
  const q = norm(value)
  const mine = q.length < 1 ? [] : saved.filter((t) => norm(t.name).includes(q)).slice(0, 8)

  useEffect(() => {
    if (!web || !open || q.length < 3) { setFound([]); return }
    setBusy(true)
    const h = setTimeout(async () => {
      const r = await searchTeamsWeb(value)
      setFound(r.filter((t) => !saved.some((s) => norm(s.name) === norm(t.name))).slice(0, 10))
      setBusy(false)
    }, 500)
    return () => { clearTimeout(h); setBusy(false) }
  }, [value, open, web, saved.length])

  const choose = (t: TeamOpt) => { onPick(t); setOpen(false) }
  const exact = saved.some((s) => norm(s.name) === q) || found.some((s) => norm(s.name) === q)

  return (
    <>
      <label className="lbl">{label}</label>
      <input placeholder="Escribí y elegí de la lista" value={value} autoComplete="off" required
        onFocus={() => setOpen(true)} onChange={(e) => { onText(e.target.value); setOpen(true) }} />
      {open && q.length > 0 && (
        <div className="teamlist">
          {mine.map((t) => (
            <button type="button" key={'m' + t.name} className="teamopt" onClick={() => choose(t)}>
              <Crest url={t.logo} /><span>{t.name}<small className="muted"> · guardado</small></span>
            </button>
          ))}
          {found.map((t) => (
            <button type="button" key={'w' + t.name + t.extra} className="teamopt" onClick={() => choose(t)}>
              <Crest url={t.logo} /><span>{t.name}{t.extra && <small className="muted"> · {t.extra}</small>}</span>
            </button>
          ))}
          {busy && <div className="small muted" style={{ padding: 8 }}>Buscando…</div>}
          {!busy && !mine.length && !found.length && q.length >= 3 && <div className="small muted" style={{ padding: 8 }}>No lo encontré. Podés usarlo igual como equipo nuevo.</div>}
          {!exact && <button type="button" className="teamopt new" onClick={() => choose({ name: value.trim(), logo: null })}>Usar «{value.trim()}» como equipo nuevo</button>}
        </div>
      )}
    </>
  )
}
