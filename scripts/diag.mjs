import { sql } from './db.mjs'
console.table(await sql(`select g.name, g.round gr, m.round, m.home, m.away, m.kickoff::text, m.home_score, m.score_manual from matches m join groups g on g.id=m.group_id where g.id in ('6ebb7d5f-650d-41bb-b448-cf56a2ae8620','4f612281-a44e-4ceb-9af9-d1367d1ebc3a') order by g.name, m.kickoff`))
console.table(await sql(`select kind, left(text,90) t, created_at::text from notifications where kind in ('admin','fin','win','ready') order by created_at desc limit 8`))
console.table(await sql(`select g.name, g.round, g.results_ready_at::text, g.results_confirmed, g.finish_notified from groups g where g.league_id is not null`))
