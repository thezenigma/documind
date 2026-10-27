-- F14/F15: answer feedback and error recording.
-- messages.feedback and messages.feedback_reason already exist in the live
-- schema (with a check constraint limiting feedback to 'up' or 'down');
-- they are written here with IF NOT EXISTS so the migration is the single
-- record of this change. usage_events.error is the column this adds.

alter table public.messages
  add column if not exists feedback text
  check (feedback in ('up', 'down'));

alter table public.messages
  add column if not exists feedback_reason text;

alter table public.usage_events
  add column if not exists error text;
