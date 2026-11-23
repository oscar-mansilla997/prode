-- Dos administradores a la vez: sin duplicados ni resultados pisados en silencio

-- 1) El anuncio del ganador se calcula una sola vez aunque dos admins confirmen o carguen al mismo tiempo
create or replace function check_group_finished(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record; mins numeric; w record; info json; lbl text; n int; wn int; top_pts int; top_ex int; pot numeric; share numeric; names text; free boolean;
begin
  -- Bloquea el prode: si dos admins disparan esto a la vez, el segundo espera y ve el estado ya actualizado
  select * into g from groups where id = gid for update;
  if g.id is null or g.finish_notified then return; end if;
  lbl := g.name || coalesce(' · Fecha ' || g.round, '');
  free := fee_num(g.fee) = 0;
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
      values (w.user_id, g.code, 'Ganaste "' || lbl || '" con ' || top_pts || ' puntos.' || case when free then ' Campeonato amistoso, sin premio en dinero.' else '' end, 'win', case when free then null else share end);
  end loop;

  insert into notifications (user_id, code, text, kind)
    select e.user_id, g.code, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'fin'
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id
    where l.paid and not (l.pts = top_pts and l.exactos = top_ex);

  select json_agg(json_build_object('name', p.name, 'alias', p.alias, 'phone', p.phone, 'avatar_url', p.avatar_url, 'amount', share))
    into info
    from get_leaderboard(gid) l join entries e on e.id = l.entry_id join profiles p on p.id = e.user_id
    where l.paid and l.pts = top_pts and l.exactos = top_ex;

  if free then
    insert into notifications (user_id, code, text, kind)
      values (g.owner_id, null, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos. Campeonato amistoso: no hay premio para transferir.', 'fin');
  else
    insert into notifications (user_id, code, text, kind, amount, payload)
      values (g.owner_id, null, 'Terminó "' || lbl || '". Ganó ' || names || ' con ' || top_pts || ' puntos.', 'admin', share, info);
  end if;
end $$;

-- 2) Guardar resultado: si otro admin ya lo cambió mientras mirabas, no se pisa; devuelve lo que hay guardado
create or replace function set_match_result(mid uuid, new_h int, new_a int, seen_h int, seen_a int)
returns json language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not is_admin() then raise exception 'No sos administrador'; end if;
  select * into m from matches where id = mid for update;
  if m.id is null then return json_build_object('ok', false, 'deleted', true); end if;
  if m.home_score is distinct from seen_h or m.away_score is distinct from seen_a then
    if m.home_score is not distinct from new_h and m.away_score is not distinct from new_a then
      return json_build_object('ok', true, 'home', m.home_score, 'away', m.away_score);
    end if;
    return json_build_object('ok', false, 'home', m.home_score, 'away', m.away_score);
  end if;
  update matches set home_score = new_h, away_score = new_a, score_manual = (new_h is not null) where id = mid;
  perform check_group_finished(m.group_id);
  return json_build_object('ok', true, 'home', new_h, 'away', new_a);
end $$;
grant execute on function set_match_result(uuid, int, int, int, int) to authenticated;

-- 3) Un mismo partido cargado a mano dos veces en el mismo prode se rechaza
delete from matches d using matches k
  where d.external_id is null and k.external_id is null and d.group_id = k.group_id
    and lower(d.home) = lower(k.home) and lower(d.away) = lower(k.away) and d.kickoff = k.kickoff
    and d.id > k.id and not exists (select 1 from predictions p where p.match_id = d.id);
do $$ begin
  create unique index if not exists matches_manual_unico on matches (group_id, lower(home), lower(away), kickoff) where external_id is null;
exception when others then raise notice 'No se creó el índice único: quedan duplicados con jugadas'; end $$;
