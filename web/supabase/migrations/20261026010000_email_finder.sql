-- Our own company database for the email finder: domain, mail server check and learned email pattern.
create table public.companies (
  name_key text primary key,
  name text not null,
  domain text,
  has_mx boolean,
  linkedin_url text,
  pattern text,
  pattern_examples integer not null default 0,
  updated_at timestamptz not null default now()
);
create index companies_domain on public.companies (domain);
alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated;

-- What we know about each person's job, and the predicted work email.
alter table public.profiles
  add column company text,
  add column company_domain text,
  add column work_email text,
  add column work_email_status text check (work_email_status in ('found', 'likely', 'guess')),
  add column work_email_confidence integer,
  add column email_alternatives text not null default '';

alter table public.leads
  add column work_email text,
  add column work_email_status text check (work_email_status in ('found', 'likely', 'guess')),
  add column work_email_confidence integer;
