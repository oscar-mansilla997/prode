alter table groups add column if not exists logo text;

drop function if exists get_group_by_code(text);
create function get_group_by_code(p_code text)
returns table (id uuid, name text, fee text, pay_alias text, closes_at timestamptz, logo text)
language sql security definer set search_path = public stable as $$
  select id, name, fee, pay_alias, closes_at, logo from groups where code = upper(trim(p_code));
$$;

create or replace function list_prodes()
returns table (id uuid, name text, fee text, code text, logo text, matches bigint, players bigint)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.fee, g.code, g.logo,
         (select count(*) from matches m where m.group_id = g.id),
         (select count(*) from entries e where e.group_id = g.id and e.status = 'approved')
  from groups g
  order by g.created_at desc;
$$;
