-- Add optional link columns to chat_messages so that system messages
-- (e.g. "order accepted") can offer a one-tap action button to the
-- student, satisfying IS 19598 ("efficient delivery notifications").
--
-- Both columns are nullable; user-to-user chat messages leave them null.

alter table public.chat_messages
  add column if not exists link_path text,
  add column if not exists link_label text;
