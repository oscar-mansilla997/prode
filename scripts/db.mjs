// Ejecuta SQL en tu proyecto de Supabase usando la API de administración (con un token).
const REF = process.env.SUPABASE_PROJECT_REF || 'mrmjpohptjnsjnszjfnq'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN

export const enabled = Boolean(TOKEN)

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase respondió ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : []
}
