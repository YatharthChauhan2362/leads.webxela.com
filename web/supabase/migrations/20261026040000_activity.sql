-- How each person must sign in, chosen by the admin who invites them.
alter table public.members
  add column login_with text not null default 'google' check (login_with in ('google', 'zoho'));

-- Everything people do in the app, for admins to review.
create table public.activity (
  id bigint generated always as identity primary key,
  member_id uuid references public.members (id) on delete set null,
  member_email text,
  action text not null,
  target text,
  detail text,
  path text,
  ip text,
  user_agent text,
  at timestamptz not null default now()
);
create index activity_at on public.activity (at desc);
create index activity_member on public.activity (member_id, at desc);
create index activity_action on public.activity (action, at desc);
alter table public.activity enable row level security;
revoke all on public.activity from anon, authenticated;
