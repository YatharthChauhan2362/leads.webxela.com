-- Admins can switch automatic features on or off per person:
-- their extension's timed checks, their searches in the hourly Claude routine, and AI reply drafts.
alter table public.members add column auto_access boolean not null default true;
