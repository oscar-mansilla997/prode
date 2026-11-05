import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase, type Profile as P } from './supabase'
import { Icon } from './components'
import Login from './pages/Login'
import Groups from './pages/Groups'
import GroupPage from './pages/GroupPage'
import Player from './pages/Player'
import Profile from './pages/Profile'
import Bell from './Bell'
import Brand from './Brand'
import { Dialogs } from './dialogs'
import NewPassword from './pages/NewPassword'
import Admin from './pages/Admin'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<P | null>(null)
  const [recovering, setRecovering] = useState(false)
  const [owner, setOwner] = useState(false)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!session) return
    const pull = async () => {
      try {
        const g = await supabase.from('groups').select('id').eq('owner_id', session.user.id)
        const ids = ((g.data as { id: string }[]) ?? []).map((x) => x.id)
        const a = await supabase.rpc('is_admin')
        setOwner(a.data === true)
        if (!ids.length) return setPending(0)
        const r = await supabase.from('entries').select('id, submitted_at').in('group_id', ids).eq('status', 'pending')
        setPending(((r.data as { submitted_at: string | null }[]) ?? []).filter((x) => x.submitted_at).length)
      } catch { /* sin datos */ }
    }
    pull()
    const t = setInterval(pull, 30000)
    return () => clearInterval(t)
  }, [session])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const loadProfile = useCallback(async () => {
    if (!session) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(data as P)
  }, [session])
  useEffect(() => { loadProfile() }, [loadProfile])

  if (!configured)
    return (
      <div className="screen">
        <div className="card">
          <h2>Falta configurar Supabase</h2>
          <p>Copiá <code>.env.example</code> a <code>.env</code> y completá tu URL y anon key.</p>
        </div>
      </div>
    )
  if (!ready) return <div className="screen">Cargando…</div>
  if (!session) return <Login />
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />
  if (!profile) return <div className="screen">Cargando…</div>

  return (
    <>
      <Dialogs />
      <header className="topbar">
        <Link to="/" className="brand"><Brand /></Link>
        <div className="right"><Bell /></div>
      </header>
      <main className="screen">
        <Routes>
          <Route path="/" element={<Groups />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/g/:id" element={<GroupPage />} />
          <Route path="/p/:code" element={<Player profile={profile} />} />
          <Route path="/perfil" element={<Profile profile={profile} onSaved={loadProfile} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'on' : '')}>{Icon.trophy}Campeonatos</NavLink>
        {owner && <NavLink to="/admin" className={({ isActive }) => (isActive ? 'on' : '')}>{Icon.shield}Admin{pending > 0 && <span className="dot">{pending}</span>}</NavLink>}
        <NavLink to="/perfil" className={({ isActive }) => (isActive ? 'on' : '')}>{Icon.user}Perfil</NavLink>
      </nav>
    </>
  )
}
