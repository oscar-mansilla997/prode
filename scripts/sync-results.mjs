// Carga los resultados de partidos ya jugados (TheSportsDB) directo en la base.
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('Sin DATABASE_URL: nada para hacer.')
  process.exit(0)
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()
const { rows } = await db.query(`
  select m.external_id, m.round, g.league_id, g.season
  from matches m join groups g on g.id = m.group_id
  where m.external_id is not null and g.league_id is not null
    and m.home_score is null and m.kickoff < now()`)

const rounds = new Map()
for (const r of rows) {
  const n = Number(String(r.round ?? '').replace(/\D/g, '')) || 0
  rounds.set(`${r.league_id}|${r.season}|${n}`, { league: r.league_id, season: r.season, round: n })
}
let updated = 0
for (const { league, season, round } of rounds.values()) {
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=${league}&r=${round}&s=${season}`)
  if (!res.ok) { console.log('Fuente respondió', res.status); continue }
  const events = (await res.json()).events ?? []
  for (const e of events) {
    if (!['FT', 'AET', 'PEN'].includes(e.strStatus) || e.intHomeScore == null || e.intAwayScore == null) continue
    const r = await db.query(
      `update matches set home_score = $1, away_score = $2
       where external_id = $3 and (home_score is distinct from $1 or away_score is distinct from $2)`,
      [Number(e.intHomeScore), Number(e.intAwayScore), String(e.idEvent)])
    updated += r.rowCount
  }
}
console.log(`Resultados actualizados: ${updated}`)
await db.end()
