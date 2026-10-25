-- Leads are what the team chose. Everything collected automatically starts as a daily find.
alter table public.leads add column is_lead boolean not null default false;
create index leads_is_lead on public.leads (is_lead, captured_day desc, score desc);

-- Existing rows: hand picked ones and anything already worked are leads; the rest are finds.
update public.leads set is_lead = true
where source in ('manual', 'referral', 'email', 'call', 'event', 'website', 'other')
   or reason like 'Next step:%'
   or assigned_to is not null
   or status <> 'new'
   or follow_up_at is not null
   or post_key like 'linkedin:profile:%';
