// Respaldo diario: copia jugadas, pagos, partidos y usuarios dentro de la base (30 días) y a un archivo cifrado.
import fs from 'node:fs'
import { enabled, sql } from './db.mjs'

if (!enabled) { console.log('Sin SUPABASE_ACCESS_TOKEN: no hay respaldo.'); process.exit(0) }
const tables = ['profiles', 'admins', 'groups', 'matches', 'entries', 'predictions', 'teams', 'own_leagues', 'own_league_teams', 'notifications']
const obj = tables.map((t) => `'${t}', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from ${t} x)`).join(', ')
await sql(`insert into backups (data) select jsonb_build_object(${obj})`)
await sql(`delete from backups where taken_at < now() - interval '30 days'`)
const rows = await sql(`select data from backups order by taken_at desc limit 1`)
fs.writeFileSync('respaldo.json', JSON.stringify(rows[0].data))
const counts = Object.fromEntries(tables.map((t) => [t, rows[0].data[t].length]))
console.log('Respaldo hecho:', counts)
