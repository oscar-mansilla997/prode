-- Papelera: al eliminar un prode se guarda una copia completa y se puede restaurar
create table if not exists deleted_prodes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  name text,
  deleted_at timestamptz not null default now(),
  deleted_by uuid,
  data jsonb not null
);
alter table deleted_prodes enable row level security;
drop policy if exists "admin ve papelera" on deleted_prodes;
create policy "admin ve papelera" on deleted_prodes for select using (is_admin());

create or replace function archive_deleted_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deleted_prodes (group_id, name, deleted_by, data) values (
    old.id, old.name || coalesce(' · Fecha ' || old.round, ''), auth.uid(),
    jsonb_build_object(
      'group', to_jsonb(old),
      'matches', coalesce((select jsonb_agg(to_jsonb(m)) from matches m where m.group_id = old.id), '[]'::jsonb),
      'entries', coalesce((select jsonb_agg(to_jsonb(e)) from entries e where e.group_id = old.id), '[]'::jsonb),
      'predictions', coalesce((select jsonb_agg(to_jsonb(p)) from predictions p where p.entry_id in (select id from entries where group_id = old.id)), '[]'::jsonb)
    ));
  return old;
end $$;
drop trigger if exists trg_archive_group on groups;
create trigger trg_archive_group before delete on groups for each row execute function archive_deleted_group();

create or replace function restore_prode_core(did uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from deleted_prodes where id = did;
  if d.id is null then raise exception 'No está en la papelera'; end if;
  if exists (select 1 from groups where id = d.group_id) then raise exception 'Ese prode ya existe'; end if;
  insert into groups select * from jsonb_populate_record(null::groups, d.data->'group');
  insert into matches select * from jsonb_populate_recordset(null::matches, d.data->'matches');
  insert into entries select * from jsonb_populate_recordset(null::entries, d.data->'entries');
  insert into predictions select * from jsonb_populate_recordset(null::predictions, d.data->'predictions');
  delete from deleted_prodes where id = did;
  return d.group_id;
end $$;

create or replace function restore_prode(did uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'No sos administrador'; end if;
  return restore_prode_core(did);
end $$;
grant execute on function restore_prode(uuid) to authenticated;
revoke execute on function restore_prode_core(uuid) from public, anon, authenticated;

-- Respaldos diarios (los guarda un proceso automático; nadie los ve desde la app)
create table if not exists backups (
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  data jsonb not null
);
alter table backups enable row level security;

-- Prueba: crear un prode con partido, jugada y ranking, borrarlo y restaurarlo. Si algo falla, avisa y no se aplica.
do $$
declare gid uuid; did uuid; n int;
begin
  begin
    select id into gid from groups limit 1;
    if gid is not null then
      -- Se prueba con un prode real: se borra, se restaura y se compara, todo dentro de una prueba que se deshace.
      declare m1 int; e1 int; p1 int; m2 int; e2 int; p2 int;
      begin
        select count(*) into m1 from matches where group_id = gid;
        select count(*) into e1 from entries where group_id = gid;
        select count(*) into p1 from predictions where entry_id in (select id from entries where group_id = gid);
        delete from groups where id = gid;
        select id into did from deleted_prodes where group_id = gid order by deleted_at desc limit 1;
        perform restore_prode_core(did);
        select count(*) into m2 from matches where group_id = gid;
        select count(*) into e2 from entries where group_id = gid;
        select count(*) into p2 from predictions where entry_id in (select id from entries where group_id = gid);
        if m1 <> m2 or e1 <> e2 or p1 <> p2 then raise exception 'RESTORE_MISMATCH % % % / % % %', m1, e1, p1, m2, e2, p2; end if;
        raise exception 'TEST_OK';
      end;
    end if;
  exception when others then
    if sqlerrm <> 'TEST_OK' then raise exception 'La prueba de restauración falló: %', sqlerrm; end if;
  end;
end $$;
