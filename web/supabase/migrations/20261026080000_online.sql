-- When each person was last active in the app, for "Online now".
alter table public.members add column last_seen_at timestamptz;
create index activity_online on public.activity (member_id, at) where action = 'online';
