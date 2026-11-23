import { supabase } from './supabase'

export const IMG_HINT = 'Ideal: PNG con fondo transparente, cuadrado, de 256 × 256 px (mínimo 128 px) y de menos de 2 MB. Si no es cuadrado, la app lo achica y lo centra sola para que no se deforme ni se corte.'

/** Deja el escudo en un cuadrado de 256 px (PNG con transparencia, centrado sin deformar) y lo sube al bucket. Devuelve la URL pública. */
export async function uploadCrest(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const S = 256
  const k = S / Math.max(bmp.width, bmp.height)
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, Math.round((S - w) / 2), Math.round((S - h) / 2), w, h)
  const blob: Blob = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('No pude leer la imagen'))), 'image/png'))
  const path = `${crypto.randomUUID()}.png`
  const up = await supabase.storage.from('crests').upload(path, blob, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  return supabase.storage.from('crests').getPublicUrl(path).data.publicUrl
}

/** Guarda el equipo en tu base (si todavía no está) para encontrarlo después sin volver a cargarlo */
export async function saveTeam(name: string, logo: string | null): Promise<void> {
  const n = name.trim()
  if (!n) return
  const { data } = await supabase.from('teams').select('id, logo').ilike('name', n.replace(/[%_]/g, ''))
  const ex = ((data as { id: string; logo: string | null }[]) ?? [])[0]
  if (!ex) { await supabase.from('teams').insert({ name: n, logo }); return }
  if (!ex.logo && logo) await supabase.from('teams').update({ logo }).eq('id', ex.id)
}
