-- Un jugador puede enviar varias jugadas en la misma fecha (cada una se paga y compite por separado)
alter table entries drop constraint if exists entries_group_id_user_id_key;
alter table entries add column if not exists num int not null default 1;

create or replace function entry_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from entries where group_id = new.group_id and user_id = new.user_id;
  if n >= 5 then raise exception 'Máximo 5 jugadas por fecha'; end if;
  if exists (select 1 from entries where group_id = new.group_id and user_id = new.user_id and submitted_at is null) then
    raise exception 'Primero enviá la jugada que tenés empezada';
  end if;
  new.num := n + 1;
  return new;
end $$;
drop trigger if exists trg_entry_number on entries;
create trigger trg_entry_number before insert on entries for each row execute function entry_number();

-- En el ranking, quien tiene más de una jugada aparece como "Nombre · Jugada 2"
create or replace function get_leaderboard(gid uuid)
returns table (entry_id uuid, name text, avatar_url text, paid boolean, pts int, exactos int)
language sql security definer set search_path = public stable as $$
  select e.id,
         pr.name || case when (select count(*) from entries x where x.group_id = e.group_id and x.user_id = e.user_id and x.submitted_at is not null) > 1
                         then ' · Jugada ' || e.num else '' end,
         pr.avatar_url, (e.status = 'approved'),
         coalesce(sum(points(p.home_pred, p.away_pred, m.home_score, m.away_score)), 0)::int,
         (count(*) filter (where points(p.home_pred, p.away_pred, m.home_score, m.away_score) = 3 and m.home_score is not null))::int
  from entries e
  join profiles pr on pr.id = e.user_id
  left join predictions p on p.entry_id = e.id
  left join matches m on m.id = p.match_id
  where e.group_id = gid and e.submitted_at is not null and is_member(gid)
  group by e.id, pr.name, pr.avatar_url, e.status, e.num, e.group_id, e.user_id
  order by 5 desc, 6 desc, 2;
$$;
