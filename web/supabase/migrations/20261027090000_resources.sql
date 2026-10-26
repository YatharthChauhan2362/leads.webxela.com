-- Team resources admins keep in one place: social profiles, founder contacts, bank details, pitch decks and other files.
-- Admins can mark an item admins only; members never receive those rows or their files.
create table public.resources (
  id bigint generated always as identity primary key,
  category text not null check (category in ('social', 'contact', 'bank', 'document', 'link', 'other')),
  title text not null check (char_length(title) between 1 and 200),
  value text not null default '' check (char_length(value) <= 5000),
  url text check (char_length(url) <= 2000),
  note text check (char_length(note) <= 2000),
  file_path text,
  file_name text,
  file_type text,
  file_size bigint,
  admins_only boolean not null default false,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_category on public.resources (category, title);
alter table public.resources enable row level security;
revoke all on public.resources from anon, authenticated;

-- Private bucket: files open only through short lived links the app signs after checking who is asking.
insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 52428800)
on conflict (id) do nothing;
