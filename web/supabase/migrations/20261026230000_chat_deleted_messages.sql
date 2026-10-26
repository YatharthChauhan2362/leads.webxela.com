-- A deleted message keeps its place with no text and no file.
alter table public.chat_messages drop constraint if exists chat_messages_check;
alter table public.chat_messages add constraint chat_messages_has_content
  check (deleted_at is not null or char_length(body) > 0 or file_path is not null);
