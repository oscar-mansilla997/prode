alter table groups add column if not exists league_id int;
alter table groups add column if not exists season text;
alter table groups add column if not exists round int;
alter table groups add column if not exists from_date date;
alter table groups add column if not exists to_date date;
alter table matches add column if not exists external_id text;
alter table matches add column if not exists home_logo text;
alter table matches add column if not exists away_logo text;
create unique index if not exists matches_ext on matches (group_id, external_id);
