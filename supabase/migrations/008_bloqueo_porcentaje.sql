-- El porcentaje del organizador y el valor de la jugada no se pueden tocar mientras hay una fecha en juego
create or replace function guard_group_money() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.commission_pct is distinct from old.commission_pct or new.fee is distinct from old.fee)
     and exists (select 1 from matches m where m.group_id = old.id and m.kickoff <= now() and m.home_score is null) then
    raise exception 'No se puede cambiar el porcentaje ni el valor de la jugada mientras hay una fecha en juego. Esperá a que termine.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_group_money on groups;
create trigger trg_guard_group_money before update on groups
  for each row execute function guard_group_money();
