-- Resultados editables por el organizador y aviso del ganador con una hora para revisar
alter table groups add column if not exists results_ready_at timestamptz;
alter table groups add column if not exists results_confirmed boolean not null default false;
alter table matches add column if not exists score_manual boolean not null default false;

create or replace function check_group_finished(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record; mins numeric; w record; info json; lbl text; n int; wn int; top_pts int; top_ex int; pot numeric; share numeric; names text;
begin
  select * into g from groups where id = gid;
  if g.id is null or g.finish_notified then return; end if;
  lbl := g.name || coalesce(' · Fecha ' || g.round, '');
  if not exists (select 1 from matches where group_id = gid) then return; end if;
  if exists (select 1 from matches where group_id = gid and home_score is null) then
    update groups set results_ready_at = null, results_confirmed = false where id = gid and results_ready_at is not null;
    return;
  end if;

  -- Todos los resultados están cargados: se espera una hora (o la confirmación del organizador) antes de anunciar al ganador
  if g.results_ready_at is null then
    update groups set results_ready_at = now() where id = gid;
    g.results_ready_at := now();
    insert into notifications (user_id, code, text, kind)
      values (g.owner_id, null, 'Se cargaron todos los resultados de "' || lbl || '". Revisalos: en 1 hora se anuncia al ganador, o confirmalo antes desde Partidos.', 'ready');
  end if;
  if not g.results_confirmed and now() < g.results_ready_at + interval '60 minutes' then return; end if;

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
      values (w.user_id, g.code, 'Ganaste "' || lbl || '" con ' || top_pts || ' puntos.', 'win', share);
  end loop;

  insert into notifications (user_id, code, text, kind)
    select e.user_id, g.code, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'fin'
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id
    where l.paid and not (l.pts = top_pts and l.exactos = top_ex);

  select json_agg(json_build_object('name', p.name, 'alias', p.alias, 'phone', p.phone, 'avatar_url', p.avatar_url, 'amount', share))
    into info
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id join profiles p on p.id = e.user_id
    where l.paid and l.pts = top_pts and l.exactos = top_ex;

  insert into notifications (user_id, code, text, kind, amount, payload)
    values (g.owner_id, null, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'admin', share, info);
end $$;

create or replace function confirm_results(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from groups where id = gid and owner_id = auth.uid()) then
    raise exception 'No sos el organizador de este campeonato';
  end if;
  update groups set results_confirmed = true where id = gid;
  perform check_group_finished(gid);
end $$;
