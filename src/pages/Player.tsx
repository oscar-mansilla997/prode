import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { money, points, supabase, statusLabel, type Entry, type Match, type Profile, type PubGroup } from '../supabase'
import { Crest, GroupRanking, fmtDate } from '../components'

type Draft = Record<string, { h: string; a: string }>

export default function Player({ profile }: { profile: Profile }) {
  const { code } = useParams()
  const [group, setGroup] = useState<PubGroup | null | undefined>(undefined)
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [tab, setTab] = useState<'jugar' | 'ranking'>('jugar')

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

  async function ensureEntry(): Promise<Entry> {
    if (entry) return entry
    const { data, error } = await supabase.from('entries').insert({ group_id: group!.id }).select().single()
    if (error) throw new Error(error.message)
    setEntry(data as Entry)
    return data as Entry
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
        <div className="potbox">Pozo para el ganador<strong>{money(Number(group.pot))}</strong><span className="small muted">{Number(group.players)} jugadores confirmados</span></div>
      </div>
      <div className="seg">
        <button className={tab === 'jugar' ? 'on' : ''} onClick={() => setTab('jugar')}>{entry?.submitted_at ? 'Mi jugada' : 'Jugar'}</button>
        <button className={tab === 'ranking' ? 'on' : ''} onClick={() => setTab('ranking')}>Ranking</button>
      </div>
      {tab === 'ranking' ? <GroupRanking group={group} meId={entry?.id} />
        : entry === undefined ? <p className="muted">Cargando…</p>
        : !complete ? (
          <div className="card"><p>Completá tu perfil una sola vez para poder jugar.</p><Link to="/perfil" className="link">Ir a mi perfil</Link></div>
        ) : <Jugada group={group} entry={entry} ensureEntry={ensureEntry} profile={profile} onChange={setEntry} />}
    </>
  )
}

function Jugada({ group, entry, ensureEntry, profile, onChange }: { group: PubGroup; entry: Entry | null; ensureEntry: () => Promise<Entry>; profile: Profile; onChange: (e: Entry) => void }) {
  const [showPay, setShowPay] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [draft, setDraft] = useState<Draft>({})
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const sent = !!entry?.submitted_at

  useEffect(() => {
    ;(async () => {
      const [m, p] = await Promise.all([
        supabase.from('matches').select('*').eq('group_id', group.id).order('kickoff'),
        entry ? supabase.from('predictions').select('*').eq('entry_id', entry.id) : Promise.resolve({ data: [] }),
      ])
      setMatches((m.data as Match[]) ?? [])
      const d: Draft = {}
      for (const x of (p.data ?? []) as { match_id: string; home_pred: number; away_pred: number }[])
        d[x.match_id] = { h: String(x.home_pred), a: String(x.away_pred) }
      setDraft(d)
      setLoaded(true)
    })()
  }, [group.id, entry?.id])

  const upd = (id: string, k: 'h' | 'a', v: string) => setDraft((d) => ({ ...d, [id]: { h: d[id]?.h ?? '', a: d[id]?.a ?? '', [k]: v } }))
  const open = matches.filter((m) => new Date(m.kickoff) > new Date())
  const missing = open.filter((m) => draft[m.id]?.h === undefined || draft[m.id]?.h === '' || draft[m.id]?.a === undefined || draft[m.id]?.a === '')

  async function saveDraft(en: Entry) {
    const rows = open
      .filter((m) => draft[m.id]?.h !== undefined && draft[m.id]?.h !== '' && draft[m.id]?.a !== undefined && draft[m.id]?.a !== '')
      .map((m) => ({ entry_id: en.id, match_id: m.id, home_pred: +draft[m.id].h, away_pred: +draft[m.id].a }))
    if (!rows.length) return null
    const { error } = await supabase.from('predictions').upsert(rows)
    return error
  }

  async function saveOnly() {
    setBusy(true); setErr('')
    let error
    try { error = await saveDraft(await ensureEntry()) } catch (x) { error = x as Error }
    setBusy(false)
    setErr(error ? error.message : 'Borrador guardado ✓')
  }

  async function send() {
    if (missing.length) return setErr(`Te faltan ${missing.length} partido(s) por completar.`)
    if (!confirm('Una vez enviada, no podés cambiar tu jugada. ¿Enviar?')) return
    setBusy(true); setErr('')
    let en: Entry
    try { en = await ensureEntry() } catch (x) { setBusy(false); return setErr((x as Error).message) }
    const e1 = await saveDraft(en)
    if (e1) { setBusy(false); return setErr(e1.message) }
    const { data, error } = await supabase.from('entries').update({ submitted_at: new Date().toISOString() }).eq('id', en.id).select().single()
    setBusy(false)
    if (error) return setErr(error.message)
    onChange(data as Entry)
    setShowPay(true)
  }

  const total = matches.reduce((a, m) => a + (points(draft[m.id] ? { home_pred: +draft[m.id].h, away_pred: +draft[m.id].a } : undefined, m) ?? 0), 0)

  return (
    <>
      {sent ? (
        <div className="card">
          <div className="row"><strong>Hola {profile.name}</strong><span className={`pill s-${entry!.status}`}>{statusLabel[entry!.status]}</span></div>
          <div className="row" style={{ margin: '6px 0' }}><span className="muted small">Tus puntos</span><span className="pts">{total}</span></div>
          <p className="small">
            {entry!.status === 'approved' && 'Tu jugada está aprobada. ¡Ya estás compitiendo!'}
            {entry!.status === 'pending' && 'Jugada enviada. Para que entre a la competencia, el organizador tiene que confirmar tu transferencia.'}
            {entry!.status === 'rejected' && 'El organizador rechazó tu jugada. Contactalo para resolverlo.'}
          </p>
        </div>
      ) : (
        <p className="muted small">Completá tus resultados y enviá la jugada. Después no se puede modificar.</p>
      )}

      {sent && entry!.status !== 'approved' && (group.fee || group.pay_alias) && (
        <div className="card pay">
          <h3>Pago pendiente</h3>
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
              <div className="row">
                <div className="muted small" style={{ margin: 0 }}>{m.round ? `${m.round} · ` : ''}{fmtDate(m.kickoff)}</div>
                {sent && (pts !== null ? <span className={`pill p${pts}`} style={{ margin: 0 }}>{pts} pts</span> : <span className="pill s-pending" style={{ margin: 0 }}>Pendiente</span>)}
              </div>
              <div className="teams">
                <span className="team"><Crest url={m.home_logo} />{m.home}</span>
                <input className="score" type="number" min={0} inputMode="numeric" disabled={locked} value={d?.h ?? ''} onChange={(e) => upd(m.id, 'h', e.target.value)} />
                <span>-</span>
                <input className="score" type="number" min={0} inputMode="numeric" disabled={locked} value={d?.a ?? ''} onChange={(e) => upd(m.id, 'a', e.target.value)} />
                <span className="team right">{m.away}<Crest url={m.away_logo} /></span>
              </div>
              {m.home_score !== null && (
                <div className="small">Resultado: <strong>{m.home_score} - {m.away_score}</strong>
                </div>
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

      {showPay && (
        <div className="modal-bg" onClick={() => setShowPay(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Jugada enviada</h2>
            <p>Para entrar a la competencia, transferí:</p>
            {group.fee && <div className="big">{group.fee}</div>}
            {group.pay_alias && (
              <>
                <p className="small muted">al alias</p>
                <div className="big code">{group.pay_alias}</div>
                <button className="primary" onClick={() => navigator.clipboard?.writeText(group.pay_alias!)}>Copiar alias</button>
              </>
            )}
            <p className="small muted">Cuando el organizador confirme tu pago, te llega un aviso en la campana y ya competís.</p>
            <button className="ghost" onClick={() => setShowPay(false)}>Listo</button>
          </div>
        </div>
      )}

    </>
  )
}
