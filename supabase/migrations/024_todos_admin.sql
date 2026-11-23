-- Todos los administradores trabajan sobre los mismos prodes: la dueña solo se distingue
-- por agregar y sacar administradores.
create or replace function is_owner(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from admins a where a.user_id = auth.uid());
$$;

drop policy if exists "ver prode (dueño o participante)" on groups;
create policy "ver prode (dueño o participante)" on groups for select using (owner_id = auth.uid() or is_member(id) or is_admin());
drop policy if exists "dueño edita prode" on groups;
create policy "dueño edita prode" on groups for update using (is_admin());
drop policy if exists "dueño borra prode" on groups;
create policy "dueño borra prode" on groups for delete using (is_admin());
drop policy if exists "crear prode" on groups;
create policy "crear prode" on groups for insert with check (is_admin());

create or replace function confirm_results(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No sos administrador'; end if;
  update groups set results_confirmed = true where id = gid;
  perform check_group_finished(gid);
end $$;

create or replace function admin_stats() returns json
language plpgsql security definer set search_path = public stable as $$
begin
  if not is_admin() then return null; end if;
  return (select json_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_today', (select count(*) from auth.users where created_at > now() - interval '1 day'),
    'players', (select count(distinct e.user_id) from entries e join groups g on g.id = e.group_id where true and e.submitted_at is not null),
    'sent', (select count(*) from entries e join groups g on g.id = e.group_id where true and e.submitted_at is not null),
    'pending', (select count(*) from entries e join groups g on g.id = e.group_id where true and e.submitted_at is not null and e.status = 'pending'),
    'approved', (select count(*) from entries e join groups g on g.id = e.group_id where true and e.status = 'approved'),
    'rejected', (select count(*) from entries e join groups g on g.id = e.group_id where true and e.status = 'rejected'),
    'campeonatos', coalesce((select json_agg(x order by x.gross desc) from (
      select g.id, g.name || coalesce(' · Fecha ' || g.round, '') as name, g.logo, g.active,
        (select count(*) from entries e where e.group_id = g.id and e.submitted_at is not null) as sent,
        (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as approved,
        fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as gross,
        round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * g.commission_pct / 100) as mine
      from groups g where true) x), '[]'::json)
  ));
end $$;


create or replace function admin_users() returns table (id uuid, name text, phone text, alias text, avatar_url text, created_at timestamptz, jugadas bigint, pagadas bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.phone, p.alias, p.avatar_url, u.created_at,
    (select count(*) from entries e where e.user_id = p.id and e.submitted_at is not null),
    (select count(*) from entries e where e.user_id = p.id and e.status = 'approved')
  from profiles p join auth.users u on u.id = p.id
  where is_admin()
  order by u.created_at desc;
$$;

create or replace function get_entry_picks(eid uuid)
returns table (home text, away text, home_logo text, away_logo text, kickoff timestamptz, home_score int, away_score int, home_pred int, away_pred int)
language sql security definer set search_path = public stable as $$
  select m.home, m.away, m.home_logo, m.away_logo, m.kickoff, m.home_score, m.away_score, p.home_pred, p.away_pred
  from entries e
  join groups g on g.id = e.group_id
  join matches m on m.group_id = g.id
  left join predictions p on p.entry_id = e.id and p.match_id = m.id
  where e.id = eid and e.submitted_at is not null
    and (g.finish_notified or e.user_id = auth.uid() or is_admin())
  order by m.kickoff;
$$;


-- Ligas propias compartidas entre administradores
drop policy if exists "ligas propias ver" on own_leagues;
create policy "ligas propias ver" on own_leagues for select using (is_admin());
drop policy if exists "ligas propias crear" on own_leagues;
create policy "ligas propias crear" on own_leagues for insert with check (is_admin());
drop policy if exists "ligas propias editar" on own_leagues;
create policy "ligas propias editar" on own_leagues for update using (is_admin());
drop policy if exists "ligas propias borrar" on own_leagues;
create policy "ligas propias borrar" on own_leagues for delete using (is_admin());
drop policy if exists "equipos de liga todo" on own_league_teams;
create policy "equipos de liga todo" on own_league_teams for all using (is_admin()) with check (is_admin());

-- Los avisos para el administrador (solicitudes, resultados cargados, ganador) les llegan a todos
create or replace function fanout_admin_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.fanout', true) = '1' then return new; end if;
  if not (new.kind in ('admin', 'ready') or new.text like '%envió su jugada en%') then return new; end if;
  if not exists (select 1 from admins where user_id = new.user_id) then return new; end if;
  perform set_config('app.fanout', '1', true);
  insert into notifications (user_id, code, text, kind, amount, payload)
    select a.user_id, new.code, new.text, new.kind, new.amount, new.payload
    from admins a where a.user_id <> new.user_id;
  perform set_config('app.fanout', '0', true);
  return new;
end $$;
drop trigger if exists trg_fanout_admin on notifications;
create trigger trg_fanout_admin after insert on notifications for each row execute function fanout_admin_notifications();
