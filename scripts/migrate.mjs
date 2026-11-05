// Aplica en orden los archivos de supabase/migrations que todavía no se aplicaron.
import fs from 'node:fs'
import path from 'node:path'
import { enabled, sql } from './db.mjs'

if (!enabled) {
  console.log('Sin SUPABASE_ACCESS_TOKEN: no se actualiza la base de datos.')
  process.exit(0)
}
await sql('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())')
const done = new Set((await sql('select name from _migrations')).map((r) => r.name))
const dir = 'supabase/migrations'
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) continue
  console.log('Aplicando', f)
  const body = fs.readFileSync(path.join(dir, f), 'utf8')
  await sql(`${body}\n;\ninsert into _migrations (name) values ('${f.replace(/'/g, '')}');`)
}
console.log('Base de datos al día.')
