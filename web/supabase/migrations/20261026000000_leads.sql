-- Yatri Leads schema. The app talks to these tables only from the server with the secret key.
-- Row level security is on with no policies, so the publishable (anon) key can read or write nothing.

create table public.leads (
  id bigint generated always as identity primary key,
  source text not null,
  post_key text not null unique,
  post_url text,
  author text,
  author_url text,
  headline text,
  text text not null,
  posted_at text,
  captured_at timestamptz not null default now(),
  captured_day date generated always as ((captured_at at time zone 'Asia/Kolkata')::date) stored,
  score integer not null default 0 check (score between 0 and 100),
  intent text,
  urgency text,
  reason text,
  budget text,
  skills text,
  emails text not null default '',
  phones text not null default '',
  websites text not null default '',
  contact_note text,
  contact_checked_at timestamptz,
  status text not null default 'new' check (status in ('new', 'contacted', 'replied', 'won', 'lost')),
  notes text not null default '',
  reply text,
  alerted boolean not null default false
);
create index leads_inbox on public.leads (captured_day desc, score desc, captured_at desc);
create index leads_author on public.leads (author_url);
create index leads_status on public.leads (status);

create table public.profiles (
  url text primary key,
  name text,
  headline text,
  emails text not null default '',
  phones text not null default '',
  websites text not null default '',
  updated_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value text not null
);

create table public.runs (
  id bigint generated always as identity primary key,
  kind text not null,
  at timestamptz not null default now(),
  found integer not null,
  added integer not null,
  error text
);

alter table public.leads enable row level security;
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.runs enable row level security;
revoke all on public.leads, public.profiles, public.settings, public.runs from anon, authenticated;

-- Numbers for the inbox header in one call.
create function public.lead_stats(p_since timestamptz, p_alert integer)
returns json language sql stable set search_path = '' as $$
  select json_build_object(
    'today', (select count(*) from public.leads where captured_at >= p_since),
    'hot', (select count(*) from public.leads where captured_at >= p_since and score >= p_alert),
    'with_contact', (select count(*) from public.leads where emails <> '' or phones <> ''),
    'total', (select count(*) from public.leads),
    'by_status', coalesce((select json_object_agg(status, n) from (select status, count(*) n from public.leads group by status) s), '{}'::json)
  );
$$;

-- LinkedIn profiles of hot leads with no email or phone that have not been looked up yet.
create function public.enrich_queue(p_min integer, p_limit integer)
returns setof text language sql stable set search_path = '' as $$
  select author_url from public.leads
  where author_url like 'https://www.linkedin.com/in/%' and emails = '' and phones = '' and contact_checked_at is null and score >= p_min
  group by author_url order by max(score) desc limit p_limit;
$$;

revoke execute on function public.lead_stats(timestamptz, integer), public.enrich_queue(integer, integer) from public, anon, authenticated;
grant execute on function public.lead_stats(timestamptz, integer), public.enrich_queue(integer, integer) to service_role;
