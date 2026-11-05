// Carga los resultados de partidos ya jugados (TheSportsDB) directo en la base.
import { enabled, sql } from './db.mjs'

if (!enabled) {
  console.log('Sin SUPABASE_ACCESS_TOKEN: nada para hacer.')
  process.exit(0)
}
// Completa logo/torneo en prodes que todavía no lo tienen (asume Liga Profesional si ya tenían partidos importados)
await sql(`update groups g set league_id = 4406 where g.league_id is null
  and exists (select 1 from matches m where m.group_id = g.id and m.external_id is not null)`)
const noLogo = await sql(`select distinct league_id from groups where league_id is not null and (logo is null or season is null)`)
for (const { league_id } of noLogo) {
  const id = Number(league_id)
  if (!Number.isInteger(id)) continue
  const r = await fetch(`https://www.thesportsdb.com/api/v1/json/123/lookupleague.php?id=${id}`)
  const l = r.ok ? (await r.json()).leagues?.[0] : null
  if (!l) continue
  const logo = String(l.strBadge ?? '').replace(/'/g, '')
  const season = String(l.strCurrentSeason ?? '').replace(/'/g, '')
  await sql(`update groups set logo = coalesce(logo, nullif('${logo}','')), season = coalesce(season, nullif('${season}',''))
    where league_id = ${id} and (logo is null or season is null)`)
}
const rows = await sql(`
  select m.external_id, m.round, g.league_id, g.season
  from matches m join groups g on g.id = m.group_id
  where m.external_id is not null and g.league_id is not null
    and m.home_score is null and m.kickoff < now()`)

const rounds = new Map()
for (const r of rows) {
  const n = Number(String(r.round ?? '').replace(/\D/g, '')) || 0
  rounds.set(`${r.league_id}|${r.season}|${n}`, { league: Number(r.league_id), season: String(r.season), round: n })
}
let updated = 0
for (const { league, season, round } of rounds.values()) {
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=${league}&r=${round}&s=${encodeURIComponent(season)}`)
  if (!res.ok) { console.log('Fuente respondió', res.status); continue }
  const events = (await res.json()).events ?? []
  for (const e of events) {
    if (!['FT', 'AET', 'PEN'].includes(e.strStatus) || e.intHomeScore == null || e.intAwayScore == null) continue
    const id = String(e.idEvent).replace(/\D/g, '')
    const h = Number(e.intHomeScore), a = Number(e.intAwayScore)
    if (!id || !Number.isInteger(h) || !Number.isInteger(a)) continue
    const out = await sql(`update matches set home_score = ${h}, away_score = ${a}
      where external_id = '${id}' and (home_score is distinct from ${h} or away_score is distinct from ${a}) returning id`)
    updated += out.length
  }
}
console.log(`Resultados actualizados: ${updated}`)
