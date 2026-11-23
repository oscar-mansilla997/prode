-- La dueña ve y administra los campeonatos de sus organizadores
create or replace function is_owner(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups where id = gid and owner_id = auth.uid())
      or exists (select 1 from admins a where a.user_id = auth.uid() and a.is_owner);
$$;

drop policy if exists "ver prode (dueño o participante)" on groups;
create policy "ver prode (dueño o participante)" on groups for select using (owner_id = auth.uid() or is_member(id) or is_owner());
drop policy if exists "dueño edita prode" on groups;
create policy "dueño edita prode" on groups for update using (owner_id = auth.uid() or is_owner());
drop policy if exists "dueño borra prode" on groups;
create policy "dueño borra prode" on groups for delete using (owner_id = auth.uid() or is_owner());
drop policy if exists "crear prode" on groups;
create policy "crear prode" on groups for insert with check (is_admin() and (owner_id = auth.uid() or is_owner()));

create or replace function confirm_results(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = gid and (owner_id = auth.uid() or is_owner())) then
    raise exception 'No sos el organizador de este campeonato';
  end if;
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
    'players', (select count(distinct e.user_id) from entries e join groups g on g.id = e.group_id where (g.owner_id = auth.uid() or is_owner()) and e.submitted_at is not null),
    'sent', (select count(*) from entries e join groups g on g.id = e.group_id where (g.owner_id = auth.uid() or is_owner()) and e.submitted_at is not null),
    'pending', (select count(*) from entries e join groups g on g.id = e.group_id where (g.owner_id = auth.uid() or is_owner()) and e.submitted_at is not null and e.status = 'pending'),
    'approved', (select count(*) from entries e join groups g on g.id = e.group_id where (g.owner_id = auth.uid() or is_owner()) and e.status = 'approved'),
    'rejected', (select count(*) from entries e join groups g on g.id = e.group_id where (g.owner_id = auth.uid() or is_owner()) and e.status = 'rejected'),
    'campeonatos', coalesce((select json_agg(x order by x.gross desc) from (
      select g.id, g.name || coalesce(' · Fecha ' || g.round, '') as name, g.logo, g.active,
        (select count(*) from entries e where e.group_id = g.id and e.submitted_at is not null) as sent,
        (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as approved,
        fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') as gross,
        round(fee_num(g.fee) * (select count(*) from entries e where e.group_id = g.id and e.status = 'approved') * g.commission_pct / 100) as mine
      from groups g where (g.owner_id = auth.uid() or is_owner())) x), '[]'::json)
  ));
end $$;
