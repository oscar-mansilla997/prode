-- Cada fecha es su propio campeonato: se paga, se juega y se premia por fecha
alter table groups add column if not exists finish_notified boolean not null default false;

drop function if exists get_group_by_code(text);
create function get_group_by_code(p_code text)
returns table (id uuid, name text, fee text, pay_alias text, closes_at timestamptz, logo text, pot numeric, players bigint, active boolean, round int, finished boolean)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.fee, g.pay_alias, g.closes_at, g.logo,
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100)),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         g.active, g.round, g.finish_notified
  from groups g where g.code = upper(trim(p_code));
$$;

-- En el inicio: una tarjeta por liga, con la fecha que se está jugando (o la última si ya terminaron todas)
drop function if exists list_prodes();
create function list_prodes()
returns table (id uuid, name text, fee text, code text, logo text, matches bigint, players bigint, pot numeric, round int, finished boolean)
language sql security definer set search_path = public stable as $$
  with cand as (
    select g.*, row_number() over (
      partition by g.league_id
      order by g.finish_notified asc,
               case when g.finish_notified then -coalesce(g.round, 0) else coalesce(g.round, 0) end asc,
               g.created_at desc) as rn
    from groups g where g.active)
  select g.id, g.name, g.fee, g.code, g.logo,
         (select count(*) from matches m where m.group_id = g.id),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100)),
         g.round, g.finish_notified
  from cand g
  where g.league_id is null or g.rn = 1
  order by g.created_at desc;
$$;

create or replace function check_group_finished(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record; w record; info json; lbl text; n int; wn int; top_pts int; top_ex int; pot numeric; share numeric; names text;
begin
  select * into g from groups where id = gid;
  if g.id is null or g.finish_notified then return; end if;
  lbl := g.name || coalesce(' · Fecha ' || g.round, '');
  if not exists (select 1 from matches where group_id = gid) then return; end if;
  if exists (select 1 from matches where group_id = gid and home_score is null) then return; end if;

  select count(*) into n from get_leaderboard(gid) where paid;
  update groups set finish_notified = true where id = gid;
  if n = 0 then return; end if;

  select pts, exactos into top_pts, top_ex from get_leaderboard(gid) where paid order by pts desc, exactos desc limit 1;
  select count(*), string_agg(name, ' y ') into wn, names from get_leaderboard(gid) where paid and pts = top_pts and exactos = top_ex;
  pot := round(fee_num(g.fee) * n * (1 - g.commission_pct / 100));
  share := round(pot / wn);

  for w in select e.user_id from get_leaderboard(gid) l join entries e on e.id = l.entry_id
           where l.paid and l.pts = top_pts and l.exactos = top_ex loop
    insert into notifications (user_id, code, text, kind, amount)
      values (w.user_id, g.code, 'Ganaste "' || lbl || '" con ' || top_pts || ' puntos.', 'win', share);
  end loop;

  insert into notifications (user_id, code, text, kind)
    select e.user_id, g.code, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'fin'
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id
    where l.paid and not (l.pts = top_pts and l.exactos = top_ex);

  select json_agg(json_build_object('name', p.name, 'alias', p.alias, 'phone', p.phone, 'avatar_url', p.avatar_url, 'amount', share))
    into info
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id join profiles p on p.id = e.user_id
    where l.paid and l.pts = top_pts and l.exactos = top_ex;

  insert into notifications (user_id, code, text, kind, amount, payload)
    values (g.owner_id, null, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'admin', share, info);
end $$;


create or replace function admin_stats() returns json
language plpgsql security definer set search_path = public stable as $$
begin
  if not is_admin() then return null; end if;
  return (select json_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_today', (select count(*) from auth.users where created_at > now() - interval '1 day'),
    'players', (select count(distinct e.user_id) from entries e join groups g on g.id = e.group_id where g.owner_id = auth.uid() and e.submitted_at is not null),
    'sent', (select count(*) from entries e join groups g on g.id = e.group_id where g.owner_id = auth.uid() and e.submitted_at is not null),
    'pending', (select count(*) from entries e join groups g on g.id = e.group_id where g.owner_id = auth.uid() and e.submitted_at is not null and e.status = 'pending'),
    'approved', (select count(*) from entries e join groups g on g.id = e.group_id where g.owner_id = auth.uid() and e.status = 'approved'),
    'rejected', (select count(*) from entries e join groups g on g.id = e.group_id where g.owner_id = auth.uid() and e.status = 'rejected'),
    'campeonatos', coalesce((select json_agg(x order by x.gross desc) from (
      select g.id, g.name || coalesce(' · Fecha ' || g.round, '') as name, g.logo, g.active,
        (select count(*) from entries e where e.group_id = g.id and e.submitted_at is not null) as sent,
        (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as approved,
        fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as gross,
        round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * g.commission_pct / 100) as mine
      from groups g where g.owner_id = auth.uid()) x), '[]'::json)
  ));
end $$;

