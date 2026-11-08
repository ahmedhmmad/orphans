-- =====================================================================
-- الإصدار 7: سجل دفعات رسائل واتساب للمعيلين (للمشرف فقط)
-- شغّله بعد migration_v6.sql:  SQL Editor ➜ New query ➜ Run
-- =====================================================================

create table if not exists public.wa_batches (
  id          text primary key,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  message     text not null,
  total       int  not null default 0,
  recipients  jsonb not null default '[]'::jsonb   -- [{fid, name, phone}] لربط الحالة بالأسماء
);

alter table public.wa_batches enable row level security;
revoke all on public.wa_batches from anon;
grant select, insert on public.wa_batches to authenticated;

drop policy if exists "admin reads batches"   on public.wa_batches;
drop policy if exists "admin inserts batches" on public.wa_batches;
create policy "admin reads batches"   on public.wa_batches for select to authenticated using (public.is_admin());
create policy "admin inserts batches" on public.wa_batches for insert to authenticated with check (public.is_admin());
