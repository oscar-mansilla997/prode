create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code text,
  text text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
drop policy if exists "ver mis avisos" on notifications;
create policy "ver mis avisos" on notifications for select using (user_id = auth.uid());
drop policy if exists "marcar mis avisos" on notifications;
create policy "marcar mis avisos" on notifications for update using (user_id = auth.uid());

create or replace function notify_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record; pname text;
begin
  select * into g from groups where id = new.group_id;
  if new.status is distinct from old.status and new.status = 'approved' then
    insert into notifications (user_id, code, text)
      values (new.user_id, g.code, '✅ Tu jugada en "' || g.name || '" fue aprobada. ¡Ya estás compitiendo!');
  elsif new.status is distinct from old.status and new.status = 'rejected' then
    insert into notifications (user_id, code, text)
      values (new.user_id, g.code, '❌ Tu jugada en "' || g.name || '" no fue aprobada. Hablá con el organizador.');
  end if;
  if old.submitted_at is null and new.submitted_at is not null then
    select name into pname from profiles where id = new.user_id;
    insert into notifications (user_id, code, text)
      values (g.owner_id, null, '📩 ' || coalesce(pname, 'Alguien') || ' envió su jugada en "' || g.name || '". Revisá la transferencia.');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_entry on entries;
create trigger trg_notify_entry after update on entries
  for each row execute function notify_entry();
