-- Una fecha terminada queda terminada: sumar partidos ya no la reabre (iban a la fecha siguiente)
drop trigger if exists trg_match_added on matches;

-- Reparación: fechas que se reabrieron al cargarles un partido nuevo.
-- Los partidos sin jugar pasan a la fecha siguiente y la fecha vieja queda terminada.
do $$
declare g record; nxt uuid;
begin
  for g in select * from groups
    where not finish_notified and results_confirmed and league_id is not null
      and exists (select 1 from matches m where m.group_id = groups.id and m.home_score is null)
      and exists (select 1 from matches m where m.group_id = groups.id and m.home_score is not null)
  loop
    select id into nxt from groups
      where owner_id = g.owner_id and league_id = g.league_id and season is not distinct from g.season and round > g.round
      order by round limit 1;
    if nxt is null then
      insert into groups (owner_id, name, fee, pay_alias, commission_pct, logo, league_id, season, round)
        values (g.owner_id, g.name, g.fee, g.pay_alias, g.commission_pct, g.logo, g.league_id, g.season, g.round + 1)
        returning id into nxt;
    end if;
    update matches set group_id = nxt where group_id = g.id and home_score is null;
    update groups set finish_notified = true where id = g.id;
  end loop;
end $$;

-- Inicio: solo la fecha que se está jugando (las terminadas van al historial)
create or replace function list_prodes()
returns table (id uuid, name text, fee text, code text, logo text, matches bigint, players bigint, pot numeric, round int, finished boolean)
language sql security definer set search_path = public stable as $$
  with cand as (
    select g.*, row_number() over (partition by g.league_id order by coalesce(g.round, 0) asc, g.created_at desc) as rn
    from groups g where g.active and not g.finish_notified)
  select g.id, g.name, g.fee, g.code, g.logo,
         (select count(*) from matches m where m.group_id = g.id),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100)),
         g.round, g.finish_notified
  from cand g
  where g.league_id is null or g.rn = 1
  order by g.created_at desc;
$$;

create or replace function list_history()
returns table (id uuid, name text, fee text, code text, logo text, matches bigint, players bigint, pot numeric, round int, finished boolean)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.fee, g.code, g.logo,
         (select count(*) from matches m where m.group_id = g.id),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100)),
         g.round, g.finish_notified
  from groups g where g.active and g.finish_notified
  order by g.created_at desc;
$$;
