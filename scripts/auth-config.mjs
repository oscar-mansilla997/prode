// Deja lista la recuperación de contraseña: dirección permitida y mail en español.
const REF = process.env.SUPABASE_PROJECT_REF || 'mrmjpohptjnsjnszjfnq'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) { console.log('Sin SUPABASE_ACCESS_TOKEN: nada para hacer.'); process.exit(0) }

const SITE = 'https://oscar-mansilla997.github.io/prode/'
const body = {
  site_url: SITE,
  uri_allow_list: `${SITE},${SITE}**,http://localhost:5173/**`,
  mailer_subjects_recovery: 'Recuperá tu contraseña · La Cabra Sport',
  mailer_templates_recovery_content:
    '<div style="font-family:Arial,sans-serif"><h2>Recuperá tu contraseña</h2>' +
    '<p>Tocá el botón para elegir una contraseña nueva. Si no lo pediste vos, ignorá este mail.</p>' +
    '<p><a href="{{ .ConfirmationURL }}" style="background:#2dd4a7;color:#04231a;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Elegir contraseña nueva</a></p></div>',
}
const patch = (b) => fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(b),
})
let res = await patch(body)
let text = await res.text()
if (!res.ok && /template/i.test(text)) {
  // El plan gratis no deja cambiar el texto del mail: dejamos solo la dirección permitida
  console.log('Plan gratis: el mail queda con el texto estándar de Supabase.')
  res = await patch({ site_url: body.site_url, uri_allow_list: body.uri_allow_list })
  text = await res.text()
}
if (!res.ok) { console.log(`No pude configurar el mail (${res.status}): ${text.slice(0, 200)}`); process.exit(1) }
console.log('Recuperación de contraseña configurada.')
