-- Phase 3 schema notes (run in Supabase SQL editor when ready)

-- Concerts: track last checks and notifications for price/status changes
alter table public.concerts
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_notified_price numeric,
  add column if not exists last_notified_status text;

-- Optional reminders table (if you prefer storing reminders explicitly)
create table if not exists public.reminders (
  id bigserial primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  concert_id bigint not null references public.concerts(id) on delete cascade,
  remind_days_before int default 2,
  created_at timestamptz default now(),
  unique (user_id, concert_id)
);

-- Notification type guidance (existing notifications table):
-- UPCOMING_SHOW_REMINDER, PRICE_DROP, LOW_TICKETS, GENERAL
