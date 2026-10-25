-- Each member can add their own search phrases and LinkedIn profiles to watch, on top of the team's.
alter table public.members
  add column searches text not null default '',
  add column watched_profiles text not null default '';
