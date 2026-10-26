-- Founders and contacts get their own phone and email, so the team can call, WhatsApp or email in one tap.
alter table public.resources
  add column phone text check (char_length(phone) <= 40),
  add column email text check (char_length(email) <= 320);
