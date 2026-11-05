create or replace function admin_stats() returns json
language plpgsql security definer set search_path = public stable as $$
begin
  if not exists (select 1 from groups where owner_id = auth.uid()) then return null; end if;
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
      select g.id, g.name, g.logo, g.active,
        (select count(*) from entries e where e.group_id = g.id and e.submitted_at is not null) as sent,
        (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as approved,
        fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as gross,
        round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * g.commission_pct / 100) as mine
      from groups g where g.owner_id = auth.uid()) x), '[]'::json)
  ));
end $$;

create or replace function admin_users() returns table (id uuid, name text, phone text, alias text, avatar_url text, created_at timestamptz, jugadas bigint, pagadas bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.phone, p.alias, p.avatar_url, u.created_at,
    (select count(*) from entries e where e.user_id = p.id and e.submitted_at is not null),
    (select count(*) from entries e where e.user_id = p.id and e.status = 'approved')
  from profiles p join auth.users u on u.id = p.id
  where exists (select 1 from groups where owner_id = auth.uid())
  order by u.created_at desc;
$$;
