-- Ligas propias: las armás vos con los equipos que elijas (ej: Liga Ischilín)
create table if not exists own_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  logo text,
  created_at timestamptz not null default now()
);
create table if not exists own_league_teams (
  league_id uuid not null references own_leagues(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  primary key (league_id, team_id)
);
alter table own_leagues enable row level security;
alter table own_league_teams enable row level security;

drop policy if exists "ligas propias ver" on own_leagues;
create policy "ligas propias ver" on own_leagues for select using (is_admin() and (owner_id = auth.uid() or is_owner()));
drop policy if exists "ligas propias crear" on own_leagues;
create policy "ligas propias crear" on own_leagues for insert with check (is_admin() and owner_id = auth.uid());
drop policy if exists "ligas propias editar" on own_leagues;
create policy "ligas propias editar" on own_leagues for update using (is_admin() and (owner_id = auth.uid() or is_owner()));
drop policy if exists "ligas propias borrar" on own_leagues;
create policy "ligas propias borrar" on own_leagues for delete using (is_admin() and (owner_id = auth.uid() or is_owner()));

drop policy if exists "equipos de liga todo" on own_league_teams;
create policy "equipos de liga todo" on own_league_teams for all
  using (is_admin() and exists (select 1 from own_leagues l where l.id = league_id and (l.owner_id = auth.uid() or is_owner())))
  with check (is_admin() and exists (select 1 from own_leagues l where l.id = league_id and (l.owner_id = auth.uid() or is_owner())));
