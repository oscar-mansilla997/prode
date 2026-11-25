import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type BannerRow = { id: string; name: string; image_url: string; link_url: string | null }

/** Publicidad cargada por la dueña. Si hay varias, van rotando. Si no hay ninguna, no se ve nada. */
export default function Banner() {
  const [list, setList] = useState<BannerRow[]>([])
  // Turno compartido entre pantallas: cada vez que entrás sale el siguiente banner, así todos se muestran parejo
  const [seq, setSeq] = useState(() => {
    let n = 0
    try { n = (Number(localStorage.getItem('banner_seq')) || 0) + 1; localStorage.setItem('banner_seq', String(n)) } catch { /* sin almacenamiento */ }
    return n
  })
  const seen = useRef(new Set<string>())

  useEffect(() => {
    supabase.from('banners').select('id, name, image_url, link_url').eq('active', true)
      .then(({ data }) => {
        setList(((data as BannerRow[]) ?? []).sort((a, b) => a.id.localeCompare(b.id)))
      })
  }, [])
  useEffect(() => {
    if (list.length < 2) return
    const t = setInterval(() => setSeq((x) => {
      const n = x + 1
      try { localStorage.setItem('banner_seq', String(n)) } catch { /* sin almacenamiento */ }
      return n
    }), 7000)
    return () => clearInterval(t)
  }, [list.length])

  const b = list.length ? list[seq % list.length] : undefined
  useEffect(() => {
    if (b && !seen.current.has(b.id)) { seen.current.add(b.id); supabase.rpc('banner_event', { bid: b.id, kind: 'view' }) }
  }, [b?.id])
  if (!b) return null

  const img = <img src={b.image_url} alt={b.name} />
  return (
    <div className="banner">
      <span className="tag">Publicidad</span>
      {b.link_url
        ? <a href={b.link_url} target="_blank" rel="noreferrer" onClick={() => supabase.rpc('banner_event', { bid: b.id, kind: 'click' })}>{img}</a>
        : img}
    </div>
  )
}
