import { sql } from './db.mjs'
console.table(await sql(`select g.id, g.name, g.league_id, g.season, g.round, g.active, g.finish_notified, (select count(*) from matches m where m.group_id=g.id) n from groups g where g.name ilike '%amistos%' or g.league_id = 4562`))
console.table(await sql(`select g.name, m.external_id, m.round, m.home, m.away, m.kickoff::text from matches m join groups g on g.id=m.group_id where g.name ilike '%amistos%' or g.league_id = 4562 order by m.kickoff limit 30`))
