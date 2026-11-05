alter table notifications add column if not exists payload json;

create or replace function check_group_finished(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record; w record; info json; n int; wn int; top_pts int; top_ex int; pot numeric; share numeric; names text;
begin
  select * into g from groups where id = gid;
  if g.id is null or g.finish_notified then return; end if;
  if not exists (select 1 from matches where group_id = gid) then return; end if;
  if exists (select 1 from matches where group_id = gid and home_score is null) then return; end if;

  select count(*) into n from get_leaderboard(gid) where paid;
  update groups set finish_notified = true where id = gid;
  if n = 0 then return; end if;

  select pts, exactos into top_pts, top_ex from get_leaderboard(gid) where paid order by pts desc, exactos desc limit 1;
  select count(*), string_agg(name, ' y ') into wn, names from get_leaderboard(gid) where paid and pts = top_pts and exactos = top_ex;
  pot := round(fee_num(g.fee) * n * (1 - g.commission_pct / 100));
  share := round(pot / wn);

  for w in select e.user_id from get_leaderboard(gid) l join entries e on e.id = l.entry_id
           where l.paid and l.pts = top_pts and l.exactos = top_ex loop
    insert into notifications (user_id, code, text, kind, amount)
      values (w.user_id, g.code, 'Ganaste "' || g.name || '" con ' || top_pts || ' puntos.', 'win', share);
  end loop;

  insert into notifications (user_id, code, text, kind)
    select e.user_id, g.code, 'Terminó "' || g.name || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'fin'
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id
    where l.paid and not (l.pts = top_pts and l.exactos = top_ex);

  select json_agg(json_build_object('name', p.name, 'alias', p.alias, 'phone', p.phone, 'avatar_url', p.avatar_url, 'amount', share))
    into info
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id join profiles p on p.id = e.user_id
    where l.paid and l.pts = top_pts and l.exactos = top_ex;

  insert into notifications (user_id, code, text, kind, amount, payload)
    values (g.owner_id, null, 'Terminó "' || g.name || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'admin', share, info);
end $$;

