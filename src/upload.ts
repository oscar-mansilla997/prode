import { supabase } from './supabase'

/** Achica la imagen (máx. 320 px, PNG con transparencia) y la sube al bucket de escudos. Devuelve la URL pública. */
export async function uploadCrest(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob: Blob = await new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('No pude leer la imagen'))), 'image/png'))
  const path = `${crypto.randomUUID()}.png`
  const up = await supabase.storage.from('crests').upload(path, blob, { contentType: 'image/png' })
  if (up.error) throw new Error(up.error.message)
  return supabase.storage.from('crests').getPublicUrl(path).data.publicUrl
}
