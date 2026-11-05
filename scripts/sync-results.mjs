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

// ---- Cuando una fecha termina, se abre sola la siguiente (cada fecha es su propio campeonato) ----
const q = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`
const done = await sql(`
  select g.id, g.owner_id, g.name, g.fee, g.pay_alias, g.commission_pct, g.logo, g.league_id, g.season, g.round
  from groups g
  where g.league_id is not null and g.round is not null and g.finish_notified and g.active
    and not exists (select 1 from groups n where n.league_id = g.league_id and n.season = g.season and n.round = g.round + 1)`)
let opened = 0
for (const g of done) {
  // La fecha que sigue es la del próximo partido que tenga la fuente (sirve también para copas con fases que no se numeran de a uno)
  let next = Number(g.round) + 1
  try {
    const nx = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=${Number(g.league_id)}`)
    const e0 = nx.ok ? ((await nx.json()).events ?? [])[0] : null
    const r0 = Number(e0?.intRound)
    if (e0 && Number.isInteger(r0) && r0 > 0 && r0 !== Number(g.round)) next = r0
  } catch { /* usamos la fecha siguiente por número */ }
  const exists = await sql(`select 1 from groups where league_id = ${Number(g.league_id)} and season = ${q(g.season)} and round = ${next} limit 1`)
  if (exists.length) continue
  const res = await fetch(`https://www.thesportsdb.com/api/v1/json/123/eventsround.php?id=${Number(g.league_id)}&r=${next}&s=${encodeURIComponent(g.season)}`)
  if (!res.ok) continue
  const all = ((await res.json()).events ?? []).filter((e) => e.idEvent && e.strHomeTeam && e.strAwayTeam && e.dateEvent)
  if (!all.length) continue
  const days = all.map((e) => Date.parse(e.dateEvent + 'T00:00:00Z')).sort((a, b) => a - b)
  const mid = days[Math.floor(days.length / 2)]
  const list = all.filter((e) => Math.abs(Date.parse(e.dateEvent + 'T00:00:00Z') - mid) <= 6 * 864e5)
  if (!list.length) continue
  const ins = await sql(`insert into groups (owner_id, name, fee, pay_alias, commission_pct, logo, league_id, season, round)
    values (${q(g.owner_id)}, ${q(g.name)}, ${q(g.fee)}, ${q(g.pay_alias)}, ${Number(g.commission_pct) || 0}, ${q(g.logo)}, ${Number(g.league_id)}, ${q(g.season)}, ${next})
    returning id`)
  const gid = ins[0].id
  const values = list.map((e) => {
    const ko = new Date((e.strTimestamp ?? `${e.dateEvent}T${e.strTime ?? '00:00:00'}`) + 'Z').toISOString()
    return `(${q(gid)}, ${q(String(e.idEvent).replace(/\D/g, ''))}, ${q('Fecha ' + next)}, ${q(e.strHomeTeam)}, ${q(e.strAwayTeam)}, ${q(ko)}, ${q(e.strHomeTeamBadge)}, ${q(e.strAwayTeamBadge)})`
  })
  await sql(`insert into matches (group_id, external_id, round, home, away, kickoff, home_logo, away_logo) values ${values.join(',')}
    on conflict (group_id, external_id) do nothing`)
  opened++
  console.log(`Fecha ${next} abierta para "${g.name}" (${list.length} partidos)`)
}
console.log(`Fechas nuevas abiertas: ${opened}`)
