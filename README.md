# Prode PWA

React + Vite + TypeScript + Supabase. Instalable como app (PWA).

## Puesta en marcha
1. Creá un proyecto en https://supabase.com
2. Authentication > Providers > Email: desactivá "Confirm email" (recomendado)
3. SQL Editor: pegá y ejecutá `supabase/schema.sql` (proyecto limpio)
4. `cp .env.example .env` y completá URL y anon key (Settings > API)
5. `npm install && npm run dev`
6. Deploy: `npm run build` y subí `dist/` a Netlify/Vercel/Cloudflare Pages (HTTPS)

## Flujo
- Todos se registran con nombre, teléfono, alias, email y contraseña; suben su foto en Perfil.
- El organizador crea el prode, carga partidos y comparte el link `/p/CODIGO`.
- El participante se anota, carga su jugada y la envía (no se puede modificar).
- El organizador ve sus datos, confirma la transferencia y lo aprueba. Solo los aprobados puntúan.
- Puntaje: 3 exacto, 1 ganador/empate.
