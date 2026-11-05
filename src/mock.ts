/* Base simulada en memoria para la DEMO. No se usa en la versión real. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>
const uid = () => crypto.randomUUID()
const t0 = Date.now()
const hrs = (n: number) => new Date(t0 + n * 3600e3).toISOString()

const db: Record<string, R[]> = { profiles: [], groups: [], matches: [], entries: [], predictions: [] }
const users: { id: string; email: string; password: string }[] = []
let current: { id: string; email: string } | null = null
const listeners = new Set<(e: string, s: any) => void>()
const session = () => (current ? { user: { id: current.id, email: current.email, is_anonymous: false } } : null)
const emit = () => listeners.forEach((cb) => cb('CHANGE', session()))

function addUser(email: string, name: string, phone: string, alias: string, birth = '1990-05-10') {
  const id = uid()
  users.push({ id, email, password: '123456' })
  db.profiles.push({ id, name, phone, alias, birth_date: birth, avatar_url: null })
  return id
}

function pts(hp: number, ap: number, hs: number | null, as: number | null) {
  if (hs === null || as === null) return 0
  if (hp === hs && ap === as) return 3
  return Math.sign(hp - ap) === Math.sign(hs - as) ? 1 : 0
}

;(function seed() {
  const admin = addUser('admin@demo.com', 'Organizador Demo', '+54 351 555 0000', 'organizador.prode')
  const juan = addUser('juan@demo.com', 'Juan Pérez', '+54 351 555 1111', 'juan.perez.mp')
  const maria = addUser('maria@demo.com', 'María Gómez', '+54 351 555 2222', 'maria.gomez')
  const pablo = addUser('pablo@demo.com', 'Pablo Ruiz', '+54 351 555 3333', 'pablo.ruiz.ar')
  const gid = uid()
  db.groups.push({ id: gid, name: 'Prode Liga Profesional', code: 'DEMO12', owner_id: admin, fee: '$5000', pay_alias: 'organizador.prode', closes_at: hrs(48), created_at: hrs(-72) })
  const mk = (round: string, home: string, away: string, k: number, hs: number | null, as: number | null) => {
    const id = uid()
    db.matches.push({ id, group_id: gid, round, home, away, kickoff: hrs(k), home_score: hs, away_score: as })
    return id
  }
  const m1 = mk('Fecha 12', 'River', 'Boca', -50, 2, 1)
  const m2 = mk('Fecha 12', 'Racing', 'Independiente', -26, 0, 0)
  const m3 = mk('Fecha 12', 'San Lorenzo', 'Estudiantes', 20, null, null)
  const m4 = mk('Fecha 12', 'Talleres', 'Belgrano', 44, null, null)
  const entry = (u: string, status: string, p: [number, number][]) => {
    const id = uid()
    db.entries.push({ id, group_id: gid, user_id: u, status, submitted_at: hrs(-80), created_at: hrs(-90) })
    ;[m1, m2, m3, m4].forEach((m, i) => db.predictions.push({ entry_id: id, match_id: m, home_pred: p[i][0], away_pred: p[i][1] }))
  }
  entry(juan, 'approved', [[2, 1], [1, 1], [1, 0], [2, 0]])
  entry(pablo, 'approved', [[1, 0], [0, 0], [0, 1], [1, 1]])
  entry(maria, 'pending', [[2, 0], [1, 0], [2, 2], [0, 0]])
})()

class Q {
  op = 'select'; f: ((r: R) => boolean)[] = []; ord: [string, boolean] | null = null
  payload: any; sel = '*'; mode = 'many'; ret = false
  constructor(public t: string) {}
  select(s = '*') { this.sel = s; this.ret = true; return this }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this }
  update(p: any) { this.op = 'update'; this.payload = p; return this }
  upsert(p: any) { this.op = 'upsert'; this.payload = p; return this }
  delete() { this.op = 'delete'; return this }
  eq(c: string, v: any) { this.f.push((r) => r[c] === v); return this }
  in(c: string, v: any[]) { this.f.push((r) => v.includes(r[c])); return this }
  order(c: string, o?: { ascending?: boolean }) { this.ord = [c, o?.ascending !== false]; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }
  then(ok?: any, bad?: any): any { return Promise.resolve(this.run()).then(ok, bad) }

  embed(r: R) {
    const out: R = { ...r }
    for (const m of this.sel.matchAll(/(\w+):(\w+)\(/g)) {
      const fk = m[1] === 'profile' ? 'user_id' : m[1] === 'group' ? 'group_id' : 'id'
      const found = db[m[2]].find((x) => x.id === r[fk])
      out[m[1]] = found ? { ...found } : null
    }
    return out
  }

  run(): R {
    const tbl = db[this.t]
    const err = (message: string) => ({ data: null, error: { message } })
    let rows = tbl.filter((r) => this.f.every((fn) => fn(r)))
    if (this.op === 'insert' || this.op === 'upsert') {
      const arr: R[] = Array.isArray(this.payload) ? this.payload : [this.payload]
      rows = []
      for (const p of arr) {
        if (this.op === 'upsert') {
          const ex = tbl.find((x) => x.entry_id === p.entry_id && x.match_id === p.match_id)
          if (ex) { Object.assign(ex, p); rows.push(ex); continue }
        }
        const row: R = { ...p }
        if (this.t !== 'predictions') row.id ??= uid()
        if (this.t === 'groups') Object.assign(row, { code: Math.random().toString(36).slice(2, 8).toUpperCase(), owner_id: current?.id, fee: p.fee ?? null, pay_alias: p.pay_alias ?? null, closes_at: p.closes_at ?? null, created_at: hrs(0) })
        if (this.t === 'entries') {
          row.user_id = current?.id; row.status = 'pending'; row.submitted_at = null; row.created_at = hrs(0)
          if (tbl.some((x) => x.group_id === row.group_id && x.user_id === row.user_id)) return err('Ya estás anotado en este prode')
        }
        if (this.t === 'matches') { row.home_score = null; row.away_score = null; row.round ??= null }
        tbl.push(row); rows.push(row)
      }
    } else if (this.op === 'update') {
      for (const r of rows) {
        const p = { ...this.payload }
        if (this.t === 'entries') {
          const owner = db.groups.find((g) => g.id === r.group_id)?.owner_id === current?.id
          if (!owner) {
            delete p.status
            if (r.submitted_at) delete p.submitted_at
            else if (p.submitted_at) {
              const missing = db.matches.some((m) => m.group_id === r.group_id && new Date(m.kickoff) > new Date() &&
                !db.predictions.some((x) => x.entry_id === r.id && x.match_id === m.id))
              if (missing) return err('Faltan pronósticos por cargar')
              p.submitted_at = hrs(0)
            }
          }
        }
        Object.assign(r, p)
      }
    } else if (this.op === 'delete') {
      const ids = new Set(rows.map((r) => r.id))
      db[this.t] = tbl.filter((r) => !ids.has(r.id))
      if (this.t === 'entries') db.predictions = db.predictions.filter((p) => !ids.has(p.entry_id))
      if (this.t === 'matches') db.predictions = db.predictions.filter((p) => !ids.has(p.match_id))
      return { data: null, error: null }
    }
    if (this.op !== 'select' && !this.ret) return { data: null, error: null }
    if (this.ord) { const [c, asc] = this.ord; rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)) }
    const out = rows.map((r) => this.embed(r))
    if (this.mode === 'single') return out[0] ? { data: out[0], error: null } : err('No encontrado')
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }
}

export const mockClient: any = {
  from: (t: string) => new Q(t),
  rpc: async (name: string, a: R) => {
    if (name === 'list_prodes') {
      return { data: db.groups.map((g) => ({ id: g.id, name: g.name, fee: g.fee, code: g.code, logo: g.logo ?? null, matches: db.matches.filter((m) => m.group_id === g.id).length, players: db.entries.filter((e) => e.group_id === g.id && e.status === 'approved').length })), error: null }
    }
    if (name === 'get_group_by_code') {
      const g = db.groups.find((x) => x.code === String(a.p_code).trim().toUpperCase())
      return { data: g ? [{ id: g.id, name: g.name, fee: g.fee, pay_alias: g.pay_alias, closes_at: g.closes_at, logo: g.logo ?? null }] : [], error: null }
    }
    const ms = db.matches.filter((m) => m.group_id === a.gid)
    const data = db.entries
      .filter((e) => e.group_id === a.gid && e.submitted_at)
      .map((e) => {
        const pr = db.profiles.find((p) => p.id === e.user_id)!
        const ps = db.predictions.filter((p) => p.entry_id === e.id)
        let pt = 0, ex = 0
        for (const p of ps) {
          const m = ms.find((x) => x.id === p.match_id)
          if (!m) continue
          const v = pts(p.home_pred, p.away_pred, m.home_score, m.away_score)
          pt += v
          if (v === 3 && m.home_score !== null) ex++
        }
        return { entry_id: e.id, name: pr.name, avatar_url: pr.avatar_url, paid: e.status === 'approved', pts: pt, exactos: ex }
      })
      .sort((a, b) => b.pts - a.pts || b.exactos - a.exactos)
    return { data, error: null }
  },
  auth: {
    getSession: async () => ({ data: { session: session() } }),
    getUser: async () => ({ data: { user: session()?.user ?? null } }),
    onAuthStateChange: (cb: any) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } } },
    signInWithPassword: async ({ email, password }: R) => {
      const u = users.find((x) => x.email === email.trim().toLowerCase() && x.password === password)
      if (!u) return { error: { message: 'Email o contraseña incorrectos' } }
      current = { id: u.id, email: u.email }; emit(); return { error: null }
    },
    signUp: async ({ email, password, options }: R) => {
      const e = email.trim().toLowerCase()
      if (users.some((x) => x.email === e)) return { error: { message: 'Ese email ya está registrado' } }
      const d = options?.data ?? {}
      const id = uid()
      users.push({ id, email: e, password })
      db.profiles.push({ id, name: d.name ?? e, phone: d.phone ?? '', alias: d.alias ?? '', birth_date: d.birth_date || null, avatar_url: null })
      current = { id, email: e }; emit(); return { error: null }
    },
    signOut: async () => { current = null; emit() },
  },
  storage: {
    from: () => {
      const files: Record<string, string> = {}
      return {
        upload: async (path: string, blob: Blob) => { files[path] = URL.createObjectURL(blob); return { error: null } },
        getPublicUrl: (path: string) => ({ data: { publicUrl: (files[path] ?? '') + '#' } }),
      }
    },
  },
}
