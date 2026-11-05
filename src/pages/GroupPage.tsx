import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { feeNum, isFinished, money, points, supabase, statusLabel, type Entry, type Group, type Match, type Prediction } from '../supabase'
import { Avatar, Crest, Ranking, fmtDate } from '../components'
import { ask, notice } from '../dialogs'
import { uploadCrest } from '../upload'
import AutoImport, { importNext, refreshResults } from './AutoImport'

type Tab = 'participantes' | 'partidos' | 'ranking' | 'ajustes'

export default function GroupPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [group, setGroup] = useState<Group | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [preds, setPreds] = useState<Prediction[]>([])
  const [tab, setTab] = useState<Tab>('participantes')
  const [rk, setRk] = useState(0)
  const locked = matches.some((m) => new Date(m.kickoff) <= new Date() && m.home_score === null)

  const load = useCallback(async () => {
    if (!id) return
    const [g, m, e] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('matches').select('*').eq('group_id', id).order('kickoff'),
      supabase.from('entries').select('*, profile:profiles(*)').eq('group_id', id).order('created_at'),
    ])
    const es = (e.data as Entry[]) ?? []
    setGroup(g.data as Group)
    setMatches((m.data as Match[]) ?? [])
    setEntries(es)
    if (es.length) {
      const p = await supabase.from('predictions').select('*').in('entry_id', es.map((x) => x.id))
      setPreds((p.data as Prediction[]) ?? [])
    } else setPreds([])
    setRk((n) => n + 1)
  }, [id])
  useEffect(() => { load() }, [load])

  // Carga resultados de partidos ya jugados, una vez al abrir el prode
  const synced = useRef(false)
  useEffect(() => {
    if (!group || synced.current || !group.league_id || matches.length === 0) return
    synced.current = true
    refreshResults(group, matches).then(() => load()).catch(() => {})
  }, [group, matches, load])

  // Si el prode está vacío, trae solo la próxima fecha y el logo del torneo
  const filled = useRef(false)
  const [filling, setFilling] = useState(false)
  useEffect(() => {
    if (!group || filled.current || matches.length > 0 || !group.league_id) return
    filled.current = true
    setFilling(true)
    importNext(group.id, group.league_id!).then(() => load()).catch(() => {}).finally(() => setFilling(false))
  }, [group, matches, load])

  if (!group) return <p className="muted">Cargando…</p>
  const link = `${location.origin}${location.pathname}#/p/${group.code}`
  const wa = `https://wa.me/?text=${encodeURIComponent(`Sumate a "${group.name}" y mandá tu jugada: ${link}`)}`

  return (
    <>
      <h2>{group.name}</h2>
      {filling && <p className="muted small">Trayendo los partidos y el logo del torneo…</p>}
      <nav className="tabs">
        {(['participantes', 'partidos', 'ranking', 'ajustes'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'ajustes' && (
        <>
          <div className="card">
            <div className="eyebrow">Link para tus participantes</div>
            <div className="code small" style={{ wordBreak: 'break-all' }}>{link}</div>
            <button className="link" onClick={() => navigator.clipboard?.writeText(link)}>Copiar</button>{' · '}
            <a className="link" href={wa} target="_blank" rel="noreferrer">Compartir por WhatsApp</a>
          </div>
          <SettingsCard group={group} locked={locked} reload={load} />
          <PotCard group={group} locked={locked} approved={entries.filter((e) => e.status === 'approved').length} reload={load} />
          <div className="card">
            <div className="eyebrow">Zona de peligro</div>
            <p className="small muted">Si lo eliminás se borran sus partidos, jugadas y ranking. No se puede deshacer. Si solo querés ocultarlo, apagalo con el interruptor de arriba.</p>
            <button className="danger" onClick={async () => {
              const n = entries.filter((e) => e.status === 'approved').length
              const msg = n > 0 ? `Este campeonato tiene ${n} jugador(es) con pago confirmado. ¿Eliminar "${group.name}" igual?` : `¿Eliminar "${group.name}"?`
              if (!(await ask(msg, { title: 'Eliminar campeonato', ok: 'Eliminar', danger: true }))) return
              const { error } = await supabase.from('groups').delete().eq('id', group.id)
              if (error) return void notice(error.message)
              nav('/admin')
            }}>Eliminar campeonato</button>
          </div>
        </>
      )}
      {tab === 'participantes' && <Participants entries={entries} matches={matches} preds={preds} reload={load} />}
      {tab === 'partidos' && <MatchesAdmin group={group} matches={matches} reload={load} />}
      {tab === 'ranking' && <Ranking key={rk} groupId={group.id} finished={isFinished(matches)} pot={potOf(group, entries.filter((e) => e.status === 'approved').length)} />}
    </>
  )
}

function Participants({ entries, matches, preds, reload }: { entries: Entry[]; matches: Match[]; preds: Prediction[]; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!entries.length) return <p className="muted">Todavía nadie se anotó. Compartí el link.</p>

  async function setStatus(e: Entry, status: Entry['status']) {
    await supabase.from('entries').update({ status }).eq('id', e.id)
    reload()
  }
  async function remove(e: Entry) {
    if (!(await ask(`¿Eliminar a ${e.profile?.name}?`, { ok: 'Eliminar', danger: true }))) return
    await supabase.from('entries').delete().eq('id', e.id)
    reload()
  }

  const approved = entries.filter((e) => e.status === 'approved').length
  return (
    <>
      <p className="muted small">{approved} aprobados de {entries.length} anotados</p>
      {entries.map((e) => {
        const pr = e.profile!
        const digits = pr.phone.replace(/\D/g, '')
        const mine = preds.filter((p) => p.entry_id === e.id)
        return (
          <div key={e.id} className="card">
            <div className="row">
              <span className="who"><Avatar url={pr.avatar_url} name={pr.name} /> <strong>{pr.name}</strong></span>
              <span className={`pill s-${e.status}`}>{e.submitted_at ? statusLabel[e.status] : 'Sin enviar'}</span>
            </div>
            <div className="small"><a className="link" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">{pr.phone}</a></div>
            {pr.birth_date && <div className="small">Nac. {new Date(pr.birth_date + 'T00:00').toLocaleDateString('es-AR')}</div>}
            <div className="small">Alias: <strong>{pr.alias}</strong></div>
            <div className="actions">
              <button className="primary small" disabled={!e.submitted_at || e.status === 'approved'} onClick={() => setStatus(e, 'approved')}>Aprobar</button>
              <button className="ghost small" disabled={e.status === 'rejected'} onClick={() => setStatus(e, 'rejected')}>Rechazar</button>
              <button className="link" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Ocultar' : 'Ver jugada'}</button>
              <button className="link" onClick={() => remove(e)}>Eliminar</button>
            </div>
            {open === e.id && (
              <div className="small">
                {matches.map((m) => {
                  const p = mine.find((x) => x.match_id === m.id)
                  const pts = points(p, m)
                  return (
                    <div key={m.id} className="row rank">
                      <span>{m.home} - {m.away}</span>
                      <span>{p ? `${p.home_pred}-${p.away_pred}` : '—'}{pts !== null && <span className={`pill p${pts}`}>{pts}</span>}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function MatchesAdmin({ group, matches, reload }: { group: Group; matches: Match[]; reload: () => void }) {
  const groupId = group.id
  const [f, setF] = useState({ round: '', home: '', away: '', kickoff: '' })
  const [err, setErr] = useState('')
  const [teams, setTeams] = useState<{ id: string; name: string; logo: string | null }[]>([])
  useEffect(() => { supabase.from('teams').select('*').order('name').then(({ data }) => setTeams((data as typeof teams) ?? [])) }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const h = teams.find((t) => t.id === f.home), a = teams.find((t) => t.id === f.away)
    if (!h || !a) return setErr('Elegí los dos equipos.')
    if (h.id === a.id) return setErr('Elegí dos equipos distintos.')
    const { error } = await supabase.from('matches').insert({
      group_id: groupId, round: f.round || null, home: h.name, away: a.name, home_logo: h.logo, away_logo: a.logo,
      kickoff: new Date(f.kickoff).toISOString(),
    })
    setErr(error?.message ?? '')
    if (!error) { setF({ ...f, home: '', away: '' }); reload() }
  }
  async function setResult(m: Match, hs: string, as: string) {
    const v = hs === '' || as === '' ? [null, null] : [+hs, +as]
    await supabase.from('matches').update({ home_score: v[0], away_score: v[1] }).eq('id', m.id)
    reload()
  }
  async function remove(m: Match) {
    await supabase.from('matches').delete().eq('id', m.id)
    reload()
  }

  return (
    <>
      {group.league_id && <AutoImport group={group} matches={matches} reload={reload} />}
      <form className="card" onSubmit={add}>
        <h3>Agregar partido</h3>
        {teams.length < 2 ? <p className="small muted">Primero cargá al menos dos equipos con su escudo en <strong>Admin → Equipos</strong>.</p> : (
          <>
            <input placeholder="Fecha / ronda (ej: Fecha 1)" value={f.round} onChange={(e) => setF({ ...f, round: e.target.value })} />
            <select value={f.home} onChange={(e) => setF({ ...f, home: e.target.value })} required>
              <option value="">Local…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={f.away} onChange={(e) => setF({ ...f, away: e.target.value })} required>
              <option value="">Visitante…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input type="datetime-local" value={f.kickoff} onChange={(e) => setF({ ...f, kickoff: e.target.value })} required />
            <button className="primary">Agregar partido</button>
          </>
        )}
        {err && <p className="msg">{err}</p>}
      </form>
      <h3>Partidos y resultados</h3>
      {matches.map((m) => <ResultRow key={m.id} m={m} onSave={setResult} onDelete={remove} />)}
    </>
  )
}

function ResultRow({ m, onSave, onDelete }: { m: Match; onSave: (m: Match, h: string, a: string) => void; onDelete: (m: Match) => void }) {
  const [h, setH] = useState(m.home_score?.toString() ?? '')
  const [a, setA] = useState(m.away_score?.toString() ?? '')
  return (
    <div className="card">
      <div className="muted small">{m.round ? `${m.round} · ` : ''}{fmtDate(m.kickoff)}</div>
      <div className="teams">
        <span className="team"><Crest url={m.home_logo} />{m.home}</span>
        <input className="score" type="number" min={0} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} />
        <span>-</span>
        <input className="score" type="number" min={0} inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} />
        <span className="team right">{m.away}<Crest url={m.away_logo} /></span>
      </div>
      <button className="primary small" onClick={() => onSave(m, h, a)}>Guardar resultado</button>{' '}
      <button className="link" onClick={() => onDelete(m)}>Eliminar</button>
    </div>
  )
}

const potOf = (g: Group, approved: number) => Math.round(feeNum(g.fee) * approved * (1 - (g.commission_pct ?? 0) / 100))

function PotCard({ group, locked, approved, reload }: { group: Group; locked: boolean; approved: number; reload: () => void }) {
  const [pct, setPct] = useState(String(group.commission_pct ?? 0))
  const [msg, setMsg] = useState('')
  const gross = feeNum(group.fee) * approved
  const mine = Math.round((gross * (Number(pct) || 0)) / 100)
  async function save() {
    const v = Math.min(100, Math.max(0, Number(pct) || 0))
    const { error } = await supabase.from('groups').update({ commission_pct: v }).eq('id', group.id)
    setMsg(error ? error.message : 'Guardado ✓')
    if (!error) reload()
  }
  return (
    <div className="card pot">
      <h3>Pozo</h3>
      <div className="row"><span>Recaudado ({approved} aprobados × {money(feeNum(group.fee))})</span><strong>{money(gross)}</strong></div>
      <div className="row"><span>Tu porcentaje</span>
        <span><input className="pct" type="number" min={0} max={100} inputMode="decimal" disabled={locked} value={pct} onChange={(e) => setPct(e.target.value)} onBlur={save} /> % = <strong>{money(mine)}</strong></span></div>
      <div className="row total"><span>Pozo para el ganador</span><strong>{money(gross - mine)}</strong></div>
      {locked && <p className="small muted">Hay una fecha en juego: el porcentaje se puede cambiar de nuevo cuando termine.</p>}
      {msg && <span className="small muted">{msg}</span>}
    </div>
  )
}

function SettingsCard({ group, locked, reload }: { group: Group; locked: boolean; reload: () => void }) {
  const [v, setV] = useState({ name: group.name, fee: group.fee ?? '', pay_alias: group.pay_alias ?? '' })
  const [msg, setMsg] = useState('')
  async function save() {
    const { error } = await supabase.from('groups').update({ name: v.name.trim() || group.name, ...(locked ? {} : { fee: v.fee.trim() || null }), pay_alias: v.pay_alias.trim() || null }).eq('id', group.id)
    setMsg(error ? error.message : 'Guardado ✓')
    if (!error) reload()
  }
  async function toggle() {
    await supabase.from('groups').update({ active: !group.active }).eq('id', group.id)
    reload()
  }
  return (
    <div className="card">
      <div className="row">
        <h3>Ajustes</h3>
        <button className={`toggle ${group.active ? 'on' : ''}`} onClick={toggle}>{group.active ? 'Activa' : 'Apagada'}</button>
      </div>
      <label className="small muted">Logo del campeonato</label>
      <div className="who">
        {group.logo ? <img className="crest" style={{ width: 44, height: 44 }} src={group.logo} alt="" /> : <span className="pos">?</span>}
        <input type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return
          try { const logo = await uploadCrest(f); await supabase.from('groups').update({ logo }).eq('id', group.id); setMsg('Logo cambiado ✓'); reload() } catch (x) { setMsg((x as Error).message) }
        }} />
      </div>
      <label className="small muted">Nombre</label>
      <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <label className="small muted">Valor de la jugada{locked && ' (bloqueado: hay una fecha en juego)'}</label>
      <input value={v.fee} placeholder="ej: $5000" disabled={locked} onChange={(e) => setV({ ...v, fee: e.target.value })} />
      <label className="small muted">Alias para transferir</label>
      <input value={v.pay_alias} onChange={(e) => setV({ ...v, pay_alias: e.target.value })} />
      <button className="primary" onClick={save}>Guardar</button>
      {msg && <span className="small muted"> {msg}</span>}
    </div>
  )
}
