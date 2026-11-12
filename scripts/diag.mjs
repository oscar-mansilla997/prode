import { sql } from './db.mjs'
console.table(await sql(`select tgname, pg_get_triggerdef(oid) d from pg_trigger where tgrelid='matches'::regclass and not tgisinternal`))
console.table(await sql(`select indexdef from pg_indexes where tablename='matches'`))
console.table(await sql(`select column_name, is_nullable, data_type from information_schema.columns where table_name='matches'`))
