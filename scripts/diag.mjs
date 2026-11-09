import { sql } from './db.mjs'
const g = await sql(`select g.id, g.name, g.round, g.finish_notified, g.results_confirmed, g.created_at::text,
  (select count(*) from matches m where m.group_id=g.id) total,
  (select count(*) from matches m where m.group_id=g.id and m.home_score is null) sin_resultado
  from groups g order by g.created_at`)
console.table(g)
const m = await sql(`select g.round gr, m.round, m.home, m.away, m.kickoff::text, m.home_score, m.created_at::text from matches m join groups g on g.id=m.group_id order by m.created_at desc limit 20`)
console.table(m)
