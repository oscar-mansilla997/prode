-- Los partidos de un campeonato visible los puede ver cualquier usuario registrado, aunque todavía no haya enviado su jugada
create or replace function group_is_visible(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups where id = gid and active);
$$;
drop policy if exists "ver partidos de campeonatos visibles" on matches;
create policy "ver partidos de campeonatos visibles" on matches for select using (auth.uid() is not null and group_is_visible(group_id));
