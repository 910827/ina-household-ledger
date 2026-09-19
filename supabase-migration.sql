-- Run this once in Supabase SQL Editor to make transaction deletions sync safely.
alter table public.transactions
  add column if not exists deleted_at timestamptz;

create index if not exists transactions_user_deleted_idx
  on public.transactions (user_id, deleted_at);

-- Soft deletion uses UPDATE. Allow each signed-in user to update only their rows.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transactions'
      and policyname = 'transactions_update_own'
  ) then
    create policy transactions_update_own
      on public.transactions
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
