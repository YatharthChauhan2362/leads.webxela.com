-- People who can sign in, the teams they belong to, and who owns each lead.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text,
  avatar_url text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  team_id uuid references public.teams (id) on delete set null,
  provider text check (provider in ('google', 'zoho')),
  api_key text unique,
  invited_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create index members_team on public.members (team_id);

alter table public.leads
  add column assigned_to uuid references public.members (id) on delete set null,
  add column captured_by uuid references public.members (id) on delete set null;
create index leads_assigned on public.leads (assigned_to);

alter table public.teams enable row level security;
alter table public.members enable row level security;
revoke all on public.teams, public.members from anon, authenticated;
