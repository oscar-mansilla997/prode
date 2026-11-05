import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase, type Profile as P } from './supabase'
import { Avatar } from './components'
import Login from './pages/Login'
import Groups from './pages/Groups'
import GroupPage from './pages/GroupPage'
import Player from './pages/Player'
import Profile from './pages/Profile'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<P | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
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
  if (!profile) return <div className="screen">Cargando…</div>

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">⚽ Prode</Link>
        <div className="right">
          <Link to="/perfil"><Avatar url={profile.avatar_url} name={profile.name || '?'} size={32} /></Link>
          <button className="link" onClick={() => supabase.auth.signOut()}>Salir</button>
        </div>
      </header>
      <main className="screen">
        <Routes>
          <Route path="/" element={<Groups />} />
          <Route path="/g/:id" element={<GroupPage />} />
          <Route path="/p/:code" element={<Player profile={profile} />} />
          <Route path="/perfil" element={<Profile profile={profile} onSaved={loadProfile} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  )
}
