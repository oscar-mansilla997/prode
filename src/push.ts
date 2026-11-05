import { supabase } from './supabase'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function key(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function pushActive(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

/** Pide permiso y deja el celular suscripto a los avisos. */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return 'Este navegador no permite avisos. En iPhone, primero agregá la app a la pantalla de inicio.'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'No diste permiso para los avisos. Podés activarlo desde los ajustes del navegador.'
  const pub = (await supabase.rpc('push_public_key')).data as string | null
  if (!pub) return 'Los avisos todavía no están listos. Probá de nuevo en unos minutos.'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(pub) }))
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const uid = (await supabase.auth.getUser()).data.user?.id
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
  return error ? error.message : null
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
