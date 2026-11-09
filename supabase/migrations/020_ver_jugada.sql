-- Jugada de un participante: solo se puede ver cuando la fecha ya terminó (o si es tuya / sos el organizador)
create or replace function get_entry_picks(eid uuid)
returns table (home text, away text, home_logo text, away_logo text, kickoff timestamptz, home_score int, away_score int, home_pred int, away_pred int)
language sql security definer set search_path = public stable as $$
  select m.home, m.away, m.home_logo, m.away_logo, m.kickoff, m.home_score, m.away_score, p.home_pred, p.away_pred
  from entries e
  join groups g on g.id = e.group_id
  join matches m on m.group_id = g.id
  left join predictions p on p.entry_id = e.id and p.match_id = m.id
  where e.id = eid and e.submitted_at is not null
    and (g.finish_notified or e.user_id = auth.uid() or g.owner_id = auth.uid())
  order by m.kickoff;
$$;
