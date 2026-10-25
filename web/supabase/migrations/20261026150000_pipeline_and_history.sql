-- One clear status list for the whole team.
alter table public.leads drop constraint if exists leads_status_check;
update public.leads set status = 'interested' where status = 'replied';
update public.leads set status = 'paid' where status = 'won';
alter table public.leads add constraint leads_status_check
  check (status in ('new', 'contacted', 'interested', 'proposal', 'contract', 'paid', 'lost'));

-- Everything that happened to a lead, and who did it.
create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  member_name text,
  kind text not null check (kind in ('created', 'status', 'assigned', 'follow_up', 'note', 'edited')),
  from_value text,
  to_value text,
  at timestamptz not null default now()
);
create index lead_events_lead on public.lead_events (lead_id, at desc);
alter table public.lead_events enable row level security;
revoke all on public.lead_events from anon, authenticated;
