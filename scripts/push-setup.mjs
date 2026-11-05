// Deja listos los avisos al celular: claves, función en Supabase y secretos. Se puede correr todas las veces que haga falta.
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import webpush from 'web-push'
import { enabled, sql } from './db.mjs'

if (!enabled) { console.log('Sin SUPABASE_ACCESS_TOKEN: nada para hacer.'); process.exit(0) }
const REF = process.env.SUPABASE_PROJECT_REF || 'mrmjpohptjnsjnszjfnq'
const H = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }

// 1) Claves (se crean una sola vez y quedan guardadas en la base)
const have = Object.fromEntries((await sql(`select name, value from app_secrets`)).map((r) => [r.name, r.value]))
if (!have.vapid_public || !have.vapid_private) {
  const k = webpush.generateVAPIDKeys()
  have.vapid_public = k.publicKey; have.vapid_private = k.privateKey
  await sql(`insert into app_secrets (name, value) values ('vapid_public','${k.publicKey}'), ('vapid_private','${k.privateKey}')
             on conflict (name) do update set value = excluded.value`)
  console.log('Claves de avisos creadas.')
}
if (!have.push_secret) {
  have.push_secret = crypto.randomBytes(24).toString('hex')
  await sql(`insert into app_secrets (name, value) values ('push_secret','${have.push_secret}') on conflict (name) do update set value = excluded.value`)
}

// 2) Secretos de la función
let res = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { name: 'VAPID_PUBLIC_KEY', value: have.vapid_public },
    { name: 'VAPID_PRIVATE_KEY', value: have.vapid_private },
    { name: 'VAPID_SUBJECT', value: 'https://oscar-mansilla997.github.io/prode/' },
    { name: 'PUSH_SECRET', value: have.push_secret },
  ]),
})
if (!res.ok) throw new Error(`Secretos: ${res.status} ${(await res.text()).slice(0, 300)}`)
console.log('Secretos de la función listos.')

// 3) Publicar la función
const form = new FormData()
form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: 'push', verify_jwt: false }))
form.append('file', new Blob([readFileSync('supabase/functions/push/index.ts')], { type: 'application/typescript' }), 'index.ts')
res = await fetch(`https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=push`, { method: 'POST', headers: H, body: form })
const body = await res.text()
if (!res.ok) throw new Error(`Función: ${res.status} ${body.slice(0, 400)}`)
console.log('Función de avisos publicada.')
