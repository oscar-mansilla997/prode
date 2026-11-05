-- TODO EN UNO. Borra lo anterior y lo crea de nuevo (usar mientras no haya datos reales).
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists predictions, entries, matches, groups, profiles cascade;
drop function if exists is_member(uuid), is_owner(uuid), get_group_by_code(text), points(int,int,int,int), get_leaderboard(uuid), handle_new_user(), guard_entry() cascade;
drop policy if exists "fotos publicas" on storage.objects;
drop policy if exists "subir mi foto" on storage.objects;
drop policy if exists "cambiar mi foto" on storage.objects;

-- Ejecutá este archivo en Supabase > SQL Editor (proyecto nuevo).
-- Recomendado: Authentication > Providers > Email > desactivar "Confirm email" (así entran directo).

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  phone text not null default '',
  alias text not null default '',
  birth_date date,
  avatar_url text
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  owner_id uuid not null references auth.users default auth.uid(),
  fee text,            -- ej: "$5000"
  pay_alias text,      -- alias donde transfieren
  closes_at timestamptz, -- cuándo termina el prode (se declaran ganadores)
  created_at timestamptz default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  round text,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  home_score int,
  away_score int
);

-- Un participante (jugada) por persona
create table entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups on delete cascade,
  user_id uuid not null references profiles(id) default auth.uid(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_at timestamptz,        -- null = borrador, con fecha = jugada enviada
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

create table predictions (
  entry_id uuid references entries on delete cascade,
  match_id uuid references matches on delete cascade,
  home_pred int not null check (home_pred >= 0),
  away_pred int not null check (away_pred >= 0),
  primary key (entry_id, match_id)
);

-- Helpers
create function is_owner(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups where id = gid and owner_id = auth.uid());
$$;

create function is_member(gid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select is_owner(gid) or exists (select 1 from entries where group_id = gid and user_id = auth.uid());
$$;

-- Datos públicos del prode para quien entra con el link
create function get_group_by_code(p_code text)
returns table (id uuid, name text, fee text, pay_alias text, closes_at timestamptz)
language sql security definer set search_path = public stable as $$
  select id, name, fee, pay_alias, closes_at from groups where code = upper(trim(p_code));
$$;

-- Puntaje: 3 exacto, 1 acierta ganador/empate, 0 resto
create function points(hp int, ap int, hs int, a_s int) returns int
language sql immutable as $$
  select case
    when hs is null or a_s is null then 0
    when hp = hs and ap = a_s then 3
    when sign(hp - ap) = sign(hs - a_s) then 1
    else 0 end;
$$;

-- Ranking: todas las jugadas enviadas. paid = aprobado por el organizador (compite por el premio)
create function get_leaderboard(gid uuid)
returns table (entry_id uuid, name text, avatar_url text, paid boolean, pts int, exactos int)
language sql security definer set search_path = public stable as $$
  select e.id, pr.name, pr.avatar_url, (e.status = 'approved'),
         coalesce(sum(points(p.home_pred, p.away_pred, m.home_score, m.away_score)), 0)::int,
         (count(*) filter (where points(p.home_pred, p.away_pred, m.home_score, m.away_score) = 3 and m.home_score is not null))::int
  from entries e
  join profiles pr on pr.id = e.user_id
  left join predictions p on p.entry_id = e.id
  left join matches m on m.id = p.match_id
  where e.group_id = gid and e.submitted_at is not null and is_member(gid)
  group by e.id, pr.name, pr.avatar_url, e.status
  order by 5 desc, 6 desc, pr.name;
$$;

-- Perfil automático al registrarse (con los datos del formulario)
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, phone, alias, birth_date) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'alias', ''),
    nullif(new.raw_user_meta_data->>'birth_date', '')::date
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Protege las reglas: el participante NO puede aprobarse solo ni cambiar una jugada enviada
create function guard_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_owner(old.group_id) then return new; end if;
  new.status := old.status;
  new.group_id := old.group_id;
  new.user_id := old.user_id;
  if old.submitted_at is not null then
    new.submitted_at := old.submitted_at;
    return new;
  end if;
  if new.submitted_at is not null then
    if exists (
      select 1 from matches m
      where m.group_id = old.group_id and m.kickoff > now()
        and not exists (select 1 from predictions p where p.entry_id = old.id and p.match_id = m.id)
    ) then raise exception 'Faltan pronósticos por cargar'; end if;
    new.submitted_at := now();
  end if;
  return new;
end $$;
create trigger trg_guard_entry before update on entries
  for each row execute function guard_entry();

-- RLS
alter table profiles enable row level security;
alter table groups enable row level security;
alter table matches enable row level security;
alter table entries enable row level security;
alter table predictions enable row level security;

create policy "ver mi perfil o el de mis participantes" on profiles for select using (
  id = auth.uid()
  or exists (select 1 from entries e where e.user_id = profiles.id and is_owner(e.group_id))
);
create policy "editar mi perfil" on profiles for update using (id = auth.uid());

create policy "ver prode (dueño o participante)" on groups for select using (owner_id = auth.uid() or is_member(id));
create policy "crear prode" on groups for insert with check (owner_id = auth.uid());
create policy "dueño edita prode" on groups for update using (owner_id = auth.uid());
create policy "dueño borra prode" on groups for delete using (owner_id = auth.uid());

create policy "ver partidos" on matches for select using (is_member(group_id));
create policy "dueño gestiona partidos" on matches for all
  using (is_owner(group_id)) with check (is_owner(group_id));

create policy "ver entradas" on entries for select using (user_id = auth.uid() or is_owner(group_id));
create policy "crear mi entrada" on entries for insert with check (
  user_id = auth.uid() and status = 'pending' and submitted_at is null
);
create policy "actualizar entrada" on entries for update using (user_id = auth.uid() or is_owner(group_id));
create policy "dueño borra entrada" on entries for delete using (is_owner(group_id));

create policy "ver pronósticos" on predictions for select using (
  exists (select 1 from entries e where e.id = entry_id and (e.user_id = auth.uid() or is_owner(e.group_id)))
);
create policy "cargar pronóstico" on predictions for insert with check (
  exists (select 1 from entries e join matches m on m.group_id = e.group_id
          where e.id = entry_id and m.id = match_id
            and e.user_id = auth.uid() and e.submitted_at is null and m.kickoff > now())
);
create policy "editar pronóstico" on predictions for update using (
  exists (select 1 from entries e join matches m on m.group_id = e.group_id
          where e.id = entry_id and m.id = match_id
            and e.user_id = auth.uid() and e.submitted_at is null and m.kickoff > now())
);

-- Fotos de perfil
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
create policy "fotos publicas" on storage.objects for select using (bucket_id = 'avatars');
create policy "subir mi foto" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cambiar mi foto" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
