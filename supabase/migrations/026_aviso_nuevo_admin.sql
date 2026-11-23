-- El aviso "Ahora sos organizador" es solo para quien se agregó: no se copia a los demás admins
create or replace function fanout_admin_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.fanout', true) = '1' then return new; end if;
  if not (coalesce(new.kind, '') in ('admin', 'ready') or new.text like '%envió su jugada en%') then return new; end if;
  if not exists (select 1 from admins where user_id = new.user_id) then return new; end if;
  perform set_config('app.fanout', '1', true);
  insert into notifications (user_id, code, text, kind, amount, payload)
    select a.user_id, new.code, new.text, new.kind, new.amount, new.payload
    from admins a where a.user_id <> new.user_id;
  perform set_config('app.fanout', '0', true);
  return new;
end $$;

-- Limpia las copias que ya se mandaron por error a la dueña
delete from notifications n using admins a
  where a.user_id = n.user_id and a.is_owner and n.text like '🎉 Ahora sos organizador%';
