// Manda el aviso al celular apenas se crea una notificación
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('no autorizado', { status: 401 })
  const { id } = await req.json()
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: n } = await sb.from('notifications').select('*').eq('id', id).single()
  if (!n) return new Response('sin aviso')
  const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', n.user_id)
  if (!subs?.length) return new Response('sin suscripciones')

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const money = n.amount ? ` Premio: $${Number(n.amount).toLocaleString('es-AR')}` : ''
  const payload = JSON.stringify({
    title: n.kind === 'win' ? '¡Ganaste!' : n.kind === 'admin' ? 'Campeonato terminado' : 'La Cabra Sport',
    body: n.text + (n.kind === 'win' ? money : ''),
    url: n.code ? `#/p/${n.code}` : n.kind === 'admin' || n.kind === 'ready' || !n.code ? '#/admin' : '',
    tag: n.id,
  })
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('id', s.id)
    }
  }))
  return new Response('ok')
})
