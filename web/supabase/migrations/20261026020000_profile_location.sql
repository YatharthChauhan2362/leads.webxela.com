alter table public.profiles add column location text;
create index profiles_updated on public.profiles (updated_at desc);
