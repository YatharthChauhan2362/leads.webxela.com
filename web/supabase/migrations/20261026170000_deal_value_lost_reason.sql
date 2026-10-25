-- What a signed deal is worth, and why a lead was lost.
alter table public.leads add column if not exists deal_value numeric(14, 2);
alter table public.leads add column if not exists lost_reason text;

alter table public.lead_events drop constraint if exists lead_events_kind_check;
alter table public.lead_events add constraint lead_events_kind_check
  check (kind in ('created', 'status', 'assigned', 'follow_up', 'note', 'edited', 'deal', 'duplicate'));
