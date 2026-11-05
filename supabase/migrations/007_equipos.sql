create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text,
  created_at timestamptz not null default now()
);
alter table teams enable row level security;
drop policy if exists "ver equipos" on teams;
create policy "ver equipos" on teams for select using (auth.uid() is not null);
drop policy if exists "admin crea equipos" on teams;
create policy "admin crea equipos" on teams for insert with check (is_admin());
drop policy if exists "admin edita equipos" on teams;
create policy "admin edita equipos" on teams for update using (is_admin());
drop policy if exists "admin borra equipos" on teams;
create policy "admin borra equipos" on teams for delete using (is_admin());

insert into storage.buckets (id, name, public) values ('crests', 'crests', true) on conflict (id) do nothing;
drop policy if exists "escudos publicos" on storage.objects;
create policy "escudos publicos" on storage.objects for select using (bucket_id = 'crests');
drop policy if exists "admin sube escudos" on storage.objects;
create policy "admin sube escudos" on storage.objects for insert with check (bucket_id = 'crests' and is_admin());
drop policy if exists "admin cambia escudos" on storage.objects;
create policy "admin cambia escudos" on storage.objects for update using (bucket_id = 'crests' and is_admin());
drop policy if exists "admin borra escudos" on storage.objects;
create policy "admin borra escudos" on storage.objects for delete using (bucket_id = 'crests' and is_admin());
