-- Bugs and ideas from the team, with a status admins set.
create table public.feedback (
  id bigint generated always as identity primary key,
  member_id uuid references public.members (id) on delete set null,
  member_name text,
  kind text not null check (kind in ('bug', 'idea', 'other')),
  title text not null check (char_length(title) between 3 and 200),
  details text not null default '' check (char_length(details) <= 5000),
  page text check (char_length(page) <= 500),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'wont')),
  admin_note text check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_member on public.feedback (member_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
