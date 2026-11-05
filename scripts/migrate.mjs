// Aplica en orden los archivos de supabase/migrations que todavía no se aplicaron.
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('Sin DATABASE_URL: no se actualiza la base de datos.')
  process.exit(0)
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()
await db.query('create table if not exists _migrations (name text primary key, applied_at timestamptz default now())')
const done = new Set((await db.query('select name from _migrations')).rows.map((r) => r.name))
const dir = 'supabase/migrations'
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) continue
  console.log('Aplicando', f)
  try {
    await db.query('begin')
    await db.query(fs.readFileSync(path.join(dir, f), 'utf8'))
    await db.query('insert into _migrations (name) values ($1)', [f])
    await db.query('commit')
  } catch (e) {
    await db.query('rollback')
    console.error('Falló', f, '->', e.message)
    process.exit(1)
  }
}
console.log('Base de datos al día.')
await db.end()
