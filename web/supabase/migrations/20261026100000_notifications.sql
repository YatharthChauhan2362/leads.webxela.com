-- In app and desktop notifications for each person.
create table public.notifications (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('hot_lead', 'assigned', 'follow_up', 'reply', 'digest', 'system')),
  title text not null,
  body text,
  lead_id bigint references public.leads (id) on delete cascade,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_member on public.notifications (member_id, created_at desc);
create index notifications_unpushed on public.notifications (member_id) where pushed_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;

-- The server's own timer runs inside Supabase, so it works on Vercel's free plan.
create extension if not exists pg_cron;
create extension if not exists pg_net;
