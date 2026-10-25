-- What each person does day to day, separate from their access role.
alter table public.members
  add column job text not null default 'other' check (job in ('lead_generator', 'bde', 'manager', 'other'));

-- Hand off and follow up.
alter table public.leads
  add column follow_up_at date,
  add column assigned_at timestamptz,
  add column contacted_at timestamptz,
  add column won_at timestamptz;
create index leads_follow_up on public.leads (assigned_to, follow_up_at);
create index leads_captured_by on public.leads (captured_by, captured_at desc);
