-- Una fecha terminada no se puede tocar: su pozo y tu ganancia quedan como estaban
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
