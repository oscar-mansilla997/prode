import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type PubGroup } from '../supabase'
import { GroupRanking } from '../components'

type G = { id: string; name: string; logo: string | null; pot: number; entry_id: string }

export default function RankingPage() {
  const [gs, setGs] = useState<G[] | null>(null)
  const [sel, setSel] = useState<string>('')
  useEffect(() => {
    ;(async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id
      const [e, p] = await Promise.all([
        supabase.from('entries').select('id, submitted_at, group:groups(id, name, logo, code)').eq('user_id', uid!),
        supabase.rpc('list_prodes'),
      ])
      const pots: Record<string, number> = {}
      for (const x of (p.data as { id: string; pot: number }[]) ?? []) pots[x.id] = Number(x.pot)
      const l = ((e.data as unknown as { id: string; submitted_at: string | null; group: Omit<G, 'pot' | 'entry_id'> }[]) ?? [])
        .filter((x) => x.submitted_at)
        .map((x) => ({ ...x.group, pot: pots[x.group.id] ?? 0, entry_id: x.id }))
      setGs(l)
      if (l[0]) setSel(l[0].id)
    })()
  }, [])
  const g = gs?.find((x) => x.id === sel)
  return (
    <>
      <h2 style={{ marginTop: 8 }}>Ranking</h2>
      {gs === null ? <p className="muted">Cargando…</p> : gs.length === 0 ? (
        <p className="empty">El ranking aparece cuando enviás tu primera jugada.<br /><Link className="link" to="/">Ver campeonatos</Link></p>
      ) : (
        <>
          <div className="chips">
            {gs.map((x) => (
              <button key={x.id} className={`chip ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
                {x.logo && <img src={x.logo} alt="" />}{x.name}
              </button>
            ))}
          </div>
          {g && <GroupRanking key={g.id} group={{ id: g.id, pot: g.pot } as Pick<PubGroup, 'id' | 'pot'>} meId={g.entry_id} />}
        </>
      )}
    </>
  )
}
