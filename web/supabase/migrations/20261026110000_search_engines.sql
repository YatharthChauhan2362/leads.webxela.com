-- Google search API keys and engines, managed by admins. Several keys from different Google accounts
-- are used one after another: when one reaches its daily limit, the next one takes over.
create table public.search_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  api_key text not null unique,
  daily_limit integer not null default 100 check (daily_limit between 1 and 10000),
  used_on date,
  used_today integer not null default 0,
  exhausted_on date,
  last_error text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.search_engines (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  kind text not null check (kind in ('profiles', 'posts', 'companies', 'contacts', 'elsewhere')),
  cx text not null unique,
  active boolean not null default true,
  used_today integer not null default 0,
  used_on date,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.search_keys enable row level security;
alter table public.search_engines enable row level security;
revoke all on public.search_keys, public.search_engines from anon, authenticated;

-- The People engine already in use.
insert into public.search_engines (label, kind, cx) values ('LinkedIn Profile Leads', 'profiles', '667ebfd0a83944a86') on conflict do nothing;
