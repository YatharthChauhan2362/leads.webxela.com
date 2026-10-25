-- Who saved each profile, so members only see their own.
alter table public.profiles add column captured_by uuid references public.members (id) on delete set null;
create index profiles_captured_by on public.profiles (captured_by);
