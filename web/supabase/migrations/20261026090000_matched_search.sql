-- Which search phrase a post matched, so people see why it is a lead.
alter table public.leads add column matched_search text;
