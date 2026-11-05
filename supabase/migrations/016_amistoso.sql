-- Campeonato amistoso: con valor de jugada 0 no hay pago, ni pozo, ni premio
create or replace function check_group_finished(gid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record; mins numeric; w record; info json; lbl text; n int; wn int; top_pts int; top_ex int; pot numeric; share numeric; names text; free boolean;
begin
  select * into g from groups where id = gid;
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


-- Si el campeonato es gratis, la jugada enviada queda aprobada sola
create or replace function guard_entry() returns trigger
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
    if fee_num((select fee from groups where id = old.group_id)) = 0 then new.status := 'approved'; end if;
  end if;
  return new;
end $$;

-- Avisos: en un amistoso no hay transferencia que revisar
create or replace function notify_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record; pname text; lbl text; free boolean;
begin
  select * into g from groups where id = new.group_id;
  lbl := g.name || coalesce(' · Fecha ' || g.round, '');
  free := fee_num(g.fee) = 0;
  if new.status is distinct from old.status and new.status = 'approved' then
    insert into notifications (user_id, code, text) values (new.user_id, g.code,
      case when free then 'Tu jugada en "' || lbl || '" quedó registrada. ¡Ya estás compitiendo!'
           else 'Tu jugada en "' || lbl || '" fue aprobada. ¡Ya estás compitiendo!' end);
  elsif new.status is distinct from old.status and new.status = 'rejected' then
    insert into notifications (user_id, code, text)
      values (new.user_id, g.code, 'Tu jugada en "' || lbl || '" no fue aprobada. Hablá con el organizador.');
  end if;
  if old.submitted_at is null and new.submitted_at is not null and not free then
    select name into pname from profiles where id = new.user_id;
    insert into notifications (user_id, code, text)
      values (g.owner_id, null, coalesce(pname, 'Alguien') || ' envió su jugada en "' || lbl || '". Revisá la transferencia.');
  end if;
  return new;
end $$;

-- Si se cambia el valor de la jugada entre 0 y más de 0, las jugadas ya enviadas se acomodan solas
create or replace function guard_group_money() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.commission_pct is distinct from old.commission_pct or new.fee is distinct from old.fee) then
    if old.finish_notified then
      raise exception 'Esta fecha ya terminó: no se puede cambiar el porcentaje ni el valor de la jugada.';
    end if;
    if exists (select 1 from matches m where m.group_id = old.id and m.kickoff <= now() and m.home_score is null) then
      raise exception 'No se puede cambiar el porcentaje ni el valor de la jugada mientras hay una fecha en juego. Esperá a que termine.';
    end if;
  end if;
  return new;
end $$;

create or replace function group_fee_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if fee_num(old.fee) = 0 and fee_num(new.fee) > 0 then
    -- pasa a tener valor: los que ya jugaron gratis tienen que pagar para competir por el premio
    insert into notifications (user_id, code, text)
      select e.user_id, new.code, '"' || new.name || '" ahora tiene valor de jugada (' || new.fee || '). Transferí para competir por el premio.'
      from entries e where e.group_id = new.id and e.submitted_at is not null and e.status = 'approved';
    update entries set status = 'pending' where group_id = new.id and submitted_at is not null and status = 'approved';
  elsif fee_num(old.fee) > 0 and fee_num(new.fee) = 0 then
    update entries set status = 'approved' where group_id = new.id and submitted_at is not null and status = 'pending';
  end if;
  return null;
end $$;
drop trigger if exists trg_group_fee_changed on groups;
create trigger trg_group_fee_changed after update of fee on groups
  for each row execute function group_fee_changed();
