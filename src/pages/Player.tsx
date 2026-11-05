import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { isFinished, money, points, supabase, statusLabel, type Entry, type Match, type Profile, type PubGroup } from '../supabase'
import { Avatar, Crest, Ranking, fmtDate } from '../components'

type Draft = Record<string, { h: string; a: string }>

export default function Player({ profile }: { profile: Profile }) {
  const { code } = useParams()
  const [group, setGroup] = useState<PubGroup | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const g = await supabase.rpc('get_group_by_code', { p_code: code })
      const gr = (g.data as PubGroup[] | null)?.[0] ?? null
      setGroup(gr)
      if (gr) {
        const e = await supabase.from('entries').select('*').eq('group_id', gr.id).eq('user_id', profile.id).maybeSingle()
        setEntry((e.data as Entry) ?? null)
      }
    })()
  }, [code, profile.id])

  async function join() {
    const { data, error } = await supabase.from('entries').insert({ group_id: group!.id }).select().single()
    if (error) return setErr(error.message)
    setEntry(data as Entry)
  }

  if (group === undefined) return <p className="muted">Cargando…</p>
  if (group === null) return <div className="card"><h2>Link inválido</h2><p className="muted">Revisá el link que te pasó el organizador.</p></div>
  if (group.active === false && !entry) return <div className="card"><h2>{group.name}</h2><p className="muted">Este prode no está disponible por ahora.</p></div>
  const complete = profile.name && profile.phone && profile.alias && profile.birth_date

  return (
    <>
      <div className="hero">
        {group.logo ? <img className="logo" src={group.logo} alt="" /> : <div className="logo ball">⚽</div>}
        <h1>{group.name}</h1>
        <div className="potbox">💰 Pozo para el ganador<strong>{money(Number(group.pot))}</strong><span className="small muted">{Number(group.players)} jugadores confirmados</span></div>
      </div>
      {entry === undefined ? <p className="muted">Cargando…</p>
        : entry === null ? (
          <div className="card">
            <h3>Tus datos</h3>
            <div className="who"><Avatar url={profile.avatar_url} name={profile.name || '?'} size={48} />
              <div><strong>{profile.name}</strong><div className="small muted">{profile.phone} · alias {profile.alias}</div></div></div>
            <p className="small muted">El organizador va a ver estos datos para confirmar tu pago.</p>
            {complete ? <button className="primary" onClick={join}>Anotarme y cargar mi jugada</button>
              : <Link to="/perfil" className="link">Completá tu perfil primero</Link>}
            <div><Link to="/perfil" className="link">Editar perfil / foto</Link></div>
            {err && <p className="msg">{err}</p>}
          </div>
        ) : <Jugada group={group} entry={entry} profile={profile} onChange={setEntry} />}
    </>
  )
}

function Jugada({ group, entry, profile, onChange }: { group: PubGroup; entry: Entry; profile: Profile; onChange: (e: Entry) => void }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [draft, setDraft] = useState<Draft>({})
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const sent = !!entry.submitted_at

  useEffect(() => {
    ;(async () => {
      const [m, p] = await Promise.all([
        supabase.from('matches').select('*').eq('group_id', group.id).order('kickoff'),
        supabase.from('predictions').select('*').eq('entry_id', entry.id),
      ])
      setMatches((m.data as Match[]) ?? [])
      const d: Draft = {}
      for (const x of (p.data ?? []) as { match_id: string; home_pred: number; away_pred: number }[])
        d[x.match_id] = { h: String(x.home_pred), a: String(x.away_pred) }
      setDraft(d)
      setLoaded(true)
    })()
  }, [group.id, entry.id])

  const upd = (id: string, k: 'h' | 'a', v: string) => setDraft((d) => ({ ...d, [id]: { h: d[id]?.h ?? '', a: d[id]?.a ?? '', [k]: v } }))
  const open = matches.filter((m) => new Date(m.kickoff) > new Date())
  const missing = open.filter((m) => draft[m.id]?.h === undefined || draft[m.id]?.h === '' || draft[m.id]?.a === undefined || draft[m.id]?.a === '')

  async function saveDraft() {
    const rows = open
      .filter((m) => draft[m.id]?.h !== undefined && draft[m.id]?.h !== '' && draft[m.id]?.a !== undefined && draft[m.id]?.a !== '')
      .map((m) => ({ entry_id: entry.id, match_id: m.id, home_pred: +draft[m.id].h, away_pred: +draft[m.id].a }))
    if (!rows.length) return null
    const { error } = await supabase.from('predictions').upsert(rows)
    return error
  }

  async function saveOnly() {
    setBusy(true); setErr('')
    const error = await saveDraft()
    setBusy(false)
    setErr(error ? error.message : 'Borrador guardado ✓')
  }

  async function send() {
    if (missing.length) return setErr(`Te faltan ${missing.length} partido(s) por completar.`)
    if (!confirm('Una vez enviada, no podés cambiar tu jugada. ¿Enviar?')) return
    setBusy(true); setErr('')
    const e1 = await saveDraft()
    if (e1) { setBusy(false); return setErr(e1.message) }
    const { data, error } = await supabase.from('entries').update({ submitted_at: new Date().toISOString() }).eq('id', entry.id).select().single()
    setBusy(false)
    if (error) return setErr(error.message)
    onChange(data as Entry)
  }

  return (
    <>
      {sent ? (
        <div className="card">
          <div className="row"><strong>Hola {profile.name}</strong><span className={`pill s-${entry.status}`}>{statusLabel[entry.status]}</span></div>
          <p className="small">
            {entry.status === 'approved' && 'Tu jugada está aprobada. ¡Ya estás compitiendo!'}
            {entry.status === 'pending' && 'Jugada enviada. Para que entre a la competencia, el organizador tiene que confirmar tu transferencia.'}
            {entry.status === 'rejected' && 'El organizador rechazó tu jugada. Contactalo para resolverlo.'}
          </p>
        </div>
      ) : (
        <p className="muted small">Completá tus resultados y enviá la jugada. Después no se puede modificar.</p>
      )}

      {entry.status !== 'approved' && (group.fee || group.pay_alias) && (
        <div className="card pay">
          <h3>💳 Pago</h3>
          {group.fee && <div>Valor de la jugada: <strong>{group.fee}</strong></div>}
          {group.pay_alias && <div>Transferí al alias: <strong className="code">{group.pay_alias}</strong>{' '}
            <button className="link" onClick={() => navigator.clipboard?.writeText(group.pay_alias!)}>copiar</button></div>}
        </div>
      )}

      <h3>Mi jugada</h3>
      {!loaded ? <p className="muted">Cargando…</p> : matches.length === 0 ? <p className="muted">El organizador todavía no cargó los partidos.</p> :
        matches.map((m) => {
          const d = draft[m.id]
          const locked = sent || new Date(m.kickoff) <= new Date()
          const pts = points(d ? { home_pred: +d.h, away_pred: +d.a } : undefined, m)
          return (
            <div key={m.id} className="card match">
              <div className="muted small">{m.round ? `${m.round} · ` : ''}{fmtDate(m.kickoff)}</div>
              <div className="teams">
                <span className="team"><Crest url={m.home_logo} />{m.home}</span>
                <input className="score" type="number" min={0} inputMode="numeric" disabled={locked} value={d?.h ?? ''} onChange={(e) => upd(m.id, 'h', e.target.value)} />
                <span>-</span>
                <input className="score" type="number" min={0} inputMode="numeric" disabled={locked} value={d?.a ?? ''} onChange={(e) => upd(m.id, 'a', e.target.value)} />
                <span className="team right">{m.away}<Crest url={m.away_logo} /></span>
              </div>
              {m.home_score !== null && (
                <div className="small">Resultado: <strong>{m.home_score} - {m.away_score}</strong>
                  {pts !== null && entry.status === 'approved' && <span className={`pill p${pts}`}>{pts} pts</span>}</div>
              )}
              {!sent && locked && <div className="small muted">Partido ya empezado, no se puede pronosticar.</div>}
            </div>
          )
        })}

      {!sent && loaded && matches.length > 0 && (
        <>
          <button className="ghost" disabled={busy} onClick={saveOnly}>Guardar borrador</button>
          <button className="primary" disabled={busy} onClick={send}>Enviar jugada</button>
        </>
      )}
      {err && <p className="msg">{err}</p>}

      {sent && (
        <>
          <h3>Ranking</h3>
          <Ranking groupId={group.id} finished={isFinished(matches)} pot={Number(group.pot)} />
        </>
      )}
    </>
  )
}
