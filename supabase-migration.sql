-- Run this once in Supabase SQL Editor to make transaction deletions sync safely.
alter table public.transactions
  add column if not exists deleted_at timestamptz;

create index if not exists transactions_user_deleted_idx
  on public.transactions (user_id, deleted_at);
