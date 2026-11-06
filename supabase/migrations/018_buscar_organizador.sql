create or replace function search_users(p_q text) returns table (id uuid, name text, email text, avatar_url text)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, u.email::text, p.avatar_url
  from profiles p join auth.users u on u.id = p.id
  where is_owner()
    and not exists (select 1 from admins a where a.user_id = p.id)
    and (coalesce(trim(p_q), '') = '' or lower(coalesce(p.name,'') || ' ' || coalesce(p.alias,'') || ' ' || u.email) like '%' || lower(trim(p_q)) || '%')
  order by p.name
  limit 20;
$$;

create or replace function add_organizer_id(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner() then return 'no'; end if;
  if exists (select 1 from admins where user_id = p_id) then return 'exists'; end if;
  if not exists (select 1 from auth.users where id = p_id) then return 'notfound'; end if;
  insert into admins (user_id, is_owner) values (p_id, false);
  insert into notifications (user_id, text) values (p_id, '🎉 Ahora sos organizador. Entrá a Admin para armar tus campeonatos.');
  return 'ok';
end $$;
