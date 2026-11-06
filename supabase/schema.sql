-- =====================================================================
-- قاعدة بيانات استمارة الأيتام - THIRD PILLAR
-- شغّل هذا الملف كاملاً مرة واحدة من: Supabase ➜ SQL Editor ➜ New query ➜ Run
--
-- الصلاحيات:
--   • الزوّار (anon): يستطيعون "إضافة" استمارة ورفع صورة فقط، ولا يستطيعون قراءة أي بيانات.
--   • المشرفون (authenticated): قراءة وتعديل وحذف.
--   ⚠️ لذلك يجب إيقاف التسجيل العام للحسابات (انظر README).
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.orphans (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 1. البيانات الشخصية لليتيم
  orphan_code         text unique,
  full_name           text not null,
  gender              text check (gender in ('male', 'female')),
  age                 int  check (age between 0 and 30),
  nationality         text,
  birth_date          date,
  mobile              text,
  arrival_date        date,
  address             text,
  sponsorship_start   date,
  sponsorship_end     date,
  photo_path          text,

  -- 2. بيانات الأب
  father_name         text,
  father_birth_date   date,
  father_death_date   date,
  father_death_cause  text,
  father_death_place  text,

  -- 3. بيانات الأم
  mother_name         text,
  mother_birth_date   date,
  mother_occupation   text,
  mother_phone        text,
  mother_status       text check (mother_status in ('alive', 'deceased')),
  mother_death_date   date,
  mother_death_cause  text,

  -- 4. الإخوة والأخوات: [{name, relation, birth_date, death_date}]
  siblings            jsonb not null default '[]'::jsonb,

  -- 5. الحالة الصحية
  has_illness         boolean,
  illness_details     text,
  war_injury          boolean,
  needs_treatment     boolean,
  treatment_cost      numeric(12,2),

  -- 6. السكن
  housing_type        text check (housing_type in ('owned', 'rented', 'temporary', 'shared')),
  housing_address     text,
  household_members   int,
  monthly_rent        numeric(12,2),

  -- 7. الوضع المالي والمعيشي
  orphans_count       int,
  family_members      int,
  guardian            text,
  income_source       text,
  monthly_income      numeric(12,2),
  other_support       boolean,
  exp_rent            numeric(12,2),
  exp_food            numeric(12,2),
  exp_treatment       numeric(12,2),
  exp_education       numeric(12,2),
  exp_other           numeric(12,2),
  exp_total           numeric(12,2)
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orphans_set_updated_at on public.orphans;
create trigger orphans_set_updated_at before update on public.orphans
  for each row execute function public.set_updated_at();

-- ---------- صلاحيات الجدول ----------
alter table public.orphans enable row level security;

grant insert on public.orphans to anon;
grant select, insert, update, delete on public.orphans to authenticated;

drop policy if exists "anyone can register"  on public.orphans;
drop policy if exists "admins can read"      on public.orphans;
drop policy if exists "admins can update"    on public.orphans;
drop policy if exists "admins can delete"    on public.orphans;

create policy "anyone can register" on public.orphans
  for insert to anon, authenticated with check (true);
create policy "admins can read" on public.orphans
  for select to authenticated using (true);
create policy "admins can update" on public.orphans
  for update to authenticated using (true) with check (true);
create policy "admins can delete" on public.orphans
  for delete to authenticated using (true);

-- ---------- تخزين صور الأيتام (خاص، غير عام) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('orphan-photos', 'orphan-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "anyone can upload orphan photo" on storage.objects;
drop policy if exists "admins read orphan photos"      on storage.objects;
drop policy if exists "admins update orphan photos"    on storage.objects;
drop policy if exists "admins delete orphan photos"    on storage.objects;

create policy "anyone can upload orphan photo" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'orphan-photos');
create policy "admins read orphan photos" on storage.objects
  for select to authenticated using (bucket_id = 'orphan-photos');
create policy "admins update orphan photos" on storage.objects
  for update to authenticated using (bucket_id = 'orphan-photos');
create policy "admins delete orphan photos" on storage.objects
  for delete to authenticated using (bucket_id = 'orphan-photos');
