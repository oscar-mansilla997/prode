create extension if not exists pg_net;

create table if not exists app_secrets (name text primary key, value text not null);
alter table app_secrets enable row level security;   -- sin políticas: solo el servidor puede leerla

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "mis suscripciones" on push_subscriptions;
create policy "mis suscripciones" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function push_public_key() returns text
language sql security definer set search_path = public stable as $$
  select value from app_secrets where name = 'vapid_public';
$$;

create or replace function notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select value into sec from app_secrets where name = 'push_secret';
  if sec is null then return new; end if;
  perform net.http_post(
    url := 'https://mrmjpohptjnsjnszjfnq.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', sec),
    body := jsonb_build_object('id', new.id));
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists trg_notify_push on notifications;
create trigger trg_notify_push after insert on notifications
  for each row execute function notify_push();
