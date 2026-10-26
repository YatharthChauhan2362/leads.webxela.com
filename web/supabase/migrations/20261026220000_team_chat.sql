-- Team chat: one room for everyone, groups, and one to one messages. Files live in a private bucket.
create table public.chat_rooms (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('everyone', 'group', 'direct')),
  name text check (char_length(name) <= 80),
  -- Two member ids in order, so a pair has one direct room.
  direct_key text unique,
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.chat_members (
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  is_admin boolean not null default false,
  last_read_id bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);
create index chat_members_member on public.chat_members (member_id);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  member_name text,
  body text not null default '' check (char_length(body) <= 4000),
  file_path text,
  file_name text check (char_length(file_name) <= 200),
  file_type text,
  file_size integer check (file_size is null or file_size between 0 and 26214400),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (char_length(body) > 0 or file_path is not null)
);
create index chat_messages_room on public.chat_messages (room_id, id);

alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_rooms, public.chat_members, public.chat_messages from anon, authenticated;

insert into public.chat_rooms (kind, name) values ('everyone', 'Everyone');

-- Private bucket: files are only reachable through short lived links the app signs after checking membership.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat', 'chat', false, 26214400)
on conflict (id) do nothing;
