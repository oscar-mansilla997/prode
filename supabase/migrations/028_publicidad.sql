-- Publicidad: banners que carga solo la dueña (administradora de administradores)
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  link_url text,
  active boolean not null default true,
  ends_at timestamptz,
  views int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now()
);
alter table banners enable row level security;
drop policy if exists "ver banners" on banners;
create policy "ver banners" on banners for select
  using (auth.uid() is not null and (is_owner() or (active and (ends_at is null or ends_at > now()))));
drop policy if exists "dueña crea banners" on banners;
create policy "dueña crea banners" on banners for insert with check (is_owner());
drop policy if exists "dueña edita banners" on banners;
create policy "dueña edita banners" on banners for update using (is_owner());
drop policy if exists "dueña borra banners" on banners;
create policy "dueña borra banners" on banners for delete using (is_owner());

create or replace function banner_event(bid uuid, kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if kind = 'click' then update banners set clicks = clicks + 1 where id = bid;
  else update banners set views = views + 1 where id = bid; end if;
end $$;
grant execute on function banner_event(uuid, text) to authenticated;

insert into storage.buckets (id, name, public) values ('banners', 'banners', true) on conflict (id) do nothing;
drop policy if exists "banners publicos" on storage.objects;
create policy "banners publicos" on storage.objects for select using (bucket_id = 'banners');
drop policy if exists "dueña sube banners" on storage.objects;
create policy "dueña sube banners" on storage.objects for insert with check (bucket_id = 'banners' and is_owner());
drop policy if exists "dueña borra banners obj" on storage.objects;
create policy "dueña borra banners obj" on storage.objects for delete using (bucket_id = 'banners' and is_owner());
