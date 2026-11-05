alter table groups add column if not exists active boolean not null default true;

drop function if exists get_group_by_code(text);
create function get_group_by_code(p_code text)
returns table (id uuid, name text, fee text, pay_alias text, closes_at timestamptz, logo text, pot numeric, players bigint, active boolean)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.fee, g.pay_alias, g.closes_at, g.logo,
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100)),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         g.active
  from groups g where g.code = upper(trim(p_code));
$$;

drop function if exists list_prodes();
create function list_prodes()
returns table (id uuid, name text, fee text, code text, logo text, matches bigint, players bigint, pot numeric)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.fee, g.code, g.logo,
         (select count(*) from matches m where m.group_id = g.id),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved'),
         round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * (1 - g.commission_pct / 100))
  from groups g
  where g.active
  order by g.created_at desc;
$$;
