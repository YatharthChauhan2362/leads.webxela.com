-- The currency of a deal value, as an ISO 4217 code like INR or USD.
alter table public.leads add column if not exists deal_currency text;
update public.leads set deal_currency = 'INR' where deal_value is not null and deal_currency is null;
alter table public.leads add constraint leads_deal_currency_check check (deal_currency is null or deal_currency ~ '^[A-Z]{3}$');
