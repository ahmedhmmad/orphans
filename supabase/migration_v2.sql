-- =====================================================================
-- الإصدار 2: حسابات المسجلين والأدوار
-- شغّل هذا الملف بعد schema.sql:  Supabase ➜ SQL Editor ➜ New query ➜ Run
--
-- ما يفعله:
--   • جدول profiles: دور كل مستخدم (admin = مشرف، registrar = مسجِّل) وحالة التفعيل.
--   • التسجيل يصبح للمستخدمين المسجلين فقط (إغلاق الإضافة المجهولة).
--   • المسجِّل يرى ويعدّل السجلات التي أدخلها هو فقط. المشرف يرى كل شيء ويحذف.
--   • أي حساب بلا ملف في profiles (حتى لو أُنشئ بالتسجيل الذاتي) لا يملك أي صلاحية.
-- =====================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  role        text not null default 'registrar' check (role in ('admin', 'registrar')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

revoke all on function public.is_staff(), public.is_admin() from public, anon;
grant execute on function public.is_staff(), public.is_admin() to authenticated;

drop policy if exists "read own or admin" on public.profiles;
create policy "read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
-- الإضافة والتعديل على profiles تتم فقط من الدالة الآمنة manage-users (service role)

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

-- ⚠️ المستخدمون الحاليون في Authentication (الحساب الذي أنشأته أنت) يصبحون مشرفين.
-- راجع Authentication ➜ Users: يجب ألا يوجد غيرك قبل تشغيل هذا الملف.
insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1)), 'admin'
from auth.users
on conflict (id) do nothing;

-- ---------- جدول الأيتام ----------
alter table public.orphans
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;
create index if not exists orphans_created_at_idx on public.orphans (created_at desc);
create index if not exists orphans_created_by_idx on public.orphans (created_by);

revoke all on public.orphans from anon;
grant select, insert, update, delete on public.orphans to authenticated;

drop policy if exists "anyone can register" on public.orphans;
drop policy if exists "admins can read"     on public.orphans;
drop policy if exists "admins can update"   on public.orphans;
drop policy if exists "admins can delete"   on public.orphans;
drop policy if exists "staff insert"        on public.orphans;
drop policy if exists "staff read"          on public.orphans;
drop policy if exists "staff update"        on public.orphans;
drop policy if exists "admin delete"        on public.orphans;

create policy "staff insert" on public.orphans
  for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());

create policy "staff read" on public.orphans
  for select to authenticated
  using (public.is_admin() or (public.is_staff() and created_by = auth.uid()));

create policy "staff update" on public.orphans
  for update to authenticated
  using (public.is_admin() or (public.is_staff() and created_by = auth.uid()))
  with check (public.is_admin() or (public.is_staff() and created_by = auth.uid()));

create policy "admin delete" on public.orphans
  for delete to authenticated using (public.is_admin());

-- ---------- صور الأيتام ----------
drop policy if exists "anyone can upload orphan photo" on storage.objects;
drop policy if exists "admins read orphan photos"      on storage.objects;
drop policy if exists "admins update orphan photos"    on storage.objects;
drop policy if exists "admins delete orphan photos"    on storage.objects;
drop policy if exists "staff upload orphan photo"      on storage.objects;
drop policy if exists "staff read orphan photos"       on storage.objects;
drop policy if exists "staff update orphan photos"     on storage.objects;
drop policy if exists "admin delete orphan photos"     on storage.objects;

create policy "staff upload orphan photo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'orphan-photos' and public.is_staff());

create policy "staff read orphan photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'orphan-photos' and
         (public.is_admin() or (public.is_staff() and coalesce(owner_id, owner::text) = auth.uid()::text)));

create policy "staff update orphan photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'orphan-photos' and
         (public.is_admin() or (public.is_staff() and coalesce(owner_id, owner::text) = auth.uid()::text)));

create policy "admin delete orphan photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'orphan-photos' and public.is_admin());
