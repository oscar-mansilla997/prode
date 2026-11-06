-- Organizadores: gente que la dueña agrega y puede armar sus propios torneos.
alter table admins add column if not exists is_owner boolean not null default false;
alter table admins add column if not exists created_at timestamptz not null default now();

-- Los administradores que ya existen son la dueña
update admins set is_owner = true where not exists (select 1 from admins where is_owner);

create or replace function is_owner() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from admins where user_id = auth.uid() and is_owner);
$$;

-- Solo la dueña ve a todos los usuarios (datos personales)
create or replace function admin_users() returns table (id uuid, name text, phone text, alias text, avatar_url text, created_at timestamptz, jugadas bigint, pagadas bigint)
language sql security definer set search_path = public stable as $$
  select p.id, p.name, p.phone, p.alias, p.avatar_url, u.created_at,
    (select count(*) from entries e where e.user_id = p.id and e.submitted_at is not null),
    (select count(*) from entries e where e.user_id = p.id and e.status = 'approved')
  from profiles p join auth.users u on u.id = p.id
  where is_owner()
  order by u.created_at desc;
$$;

create or replace function list_organizers() returns table (id uuid, name text, email text, avatar_url text, created_at timestamptz, campeonatos bigint, aprobadas bigint)
language sql security definer set search_path = public stable as $$
  select a.user_id, p.name, u.email::text, p.avatar_url, a.created_at,
    (select count(*) from groups g where g.owner_id = a.user_id),
    (select count(*) from entries e join groups g on g.id = e.group_id where g.owner_id = a.user_id and e.status = 'approved')
  from admins a join auth.users u on u.id = a.user_id left join profiles p on p.id = a.user_id
  where is_owner() and not a.is_owner
  order by a.created_at desc;
$$;

create or replace function add_organizer(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_owner() then return 'no'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then return 'notfound'; end if;
  if exists (select 1 from admins where user_id = uid) then return 'exists'; end if;
  insert into admins (user_id, is_owner) values (uid, false);
  insert into notifications (user_id, text) values (uid, '🎉 Ahora sos organizador. Entrá a Admin para armar tus campeonatos.');
  return 'ok';
end $$;

-- Al sacar a un organizador, sus campeonatos pasan a la dueña (para no dejar pagos sin atender)
create or replace function remove_organizer(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not is_owner() then return false; end if;
  if exists (select 1 from admins where user_id = p_id and is_owner) then return false; end if;
  update groups set owner_id = me where owner_id = p_id;
  delete from admins where user_id = p_id;
  return true;
end $$;
