-- =====================================================================
-- الإصدار 5: العائلات المشتركة
--   • جدول families: بيانات الأب والأم والإخوة غير المسجلين والسكن والمعيل والدخل والمصروفات (تُحفظ مرة واحدة).
--   • كل يتيم له family_id. الأيتام المرتبطون بنفس العائلة يشتركون في هذه البيانات.
--   • الحالة الصحية والبيانات الشخصية تبقى لكل يتيم على حدة.
-- شغّله بعد migration_v4.sql:  SQL Editor ➜ New query ➜ Run
-- أعمدة العائلة القديمة في جدول orphans تبقى كنسخة احتياطية ولا يستخدمها التطبيق (يمكن حذفها لاحقاً).
-- =====================================================================

create table if not exists public.families (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,

  father_name         text,
  father_birth_date   date,
  father_death_date   date,
  father_death_cause  text,
  father_death_place  text,

  mother_name         text,
  mother_birth_date   date,
  mother_occupation   text,
  mother_phone        text,
  mother_status       text check (mother_status in ('alive', 'deceased')),
  mother_death_date   date,
  mother_death_cause  text,

  -- إخوة غير مسجلين في النظام فقط (المسجلون يظهرون تلقائياً من الأيتام المرتبطين)
  siblings            jsonb not null default '[]'::jsonb,

  housing_type        text check (housing_type in ('owned', 'rented', 'temporary', 'shared', 'sponsored')),
  housing_address     text,
  household_members   int,
  monthly_rent        numeric(12,2),

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
  exp_total           numeric(12,2),

  src_orphan          uuid   -- مؤقت لعملية النقل
);

drop trigger if exists families_set_updated_at on public.families;
create trigger families_set_updated_at before update on public.families
  for each row execute function public.set_updated_at();

alter table public.orphans add column if not exists family_id uuid references public.families(id) on delete set null;
create index if not exists orphans_family_id_idx on public.orphans (family_id);

-- ---------- نقل بيانات العائلة الحالية: عائلة مستقلة لكل يتيم موجود ----------
insert into public.families (
  created_by, created_at, src_orphan,
  father_name, father_birth_date, father_death_date, father_death_cause, father_death_place,
  mother_name, mother_birth_date, mother_occupation, mother_phone, mother_status, mother_death_date, mother_death_cause,
  siblings, housing_type, housing_address, household_members, monthly_rent,
  orphans_count, family_members, guardian, income_source, monthly_income, other_support,
  exp_rent, exp_food, exp_treatment, exp_education, exp_other, exp_total)
select
  o.created_by, o.created_at, o.id,
  o.father_name, o.father_birth_date, o.father_death_date, o.father_death_cause, o.father_death_place,
  o.mother_name, o.mother_birth_date, o.mother_occupation, o.mother_phone, o.mother_status, o.mother_death_date, o.mother_death_cause,
  coalesce(o.siblings, '[]'::jsonb), o.housing_type, o.housing_address, o.household_members, o.monthly_rent,
  o.orphans_count, o.family_members, o.guardian, o.income_source, o.monthly_income, o.other_support,
  o.exp_rent, o.exp_food, o.exp_treatment, o.exp_education, o.exp_other, o.exp_total
from public.orphans o
where o.family_id is null;

update public.orphans o set family_id = f.id
from public.families f
where f.src_orphan = o.id and o.family_id is null;

alter table public.families drop column src_orphan;

-- ---------- الصلاحيات ----------
alter table public.families enable row level security;
revoke all on public.families from anon;
grant select, insert, update, delete on public.families to authenticated;

drop policy if exists "family insert" on public.families;
drop policy if exists "family read"   on public.families;
drop policy if exists "family update" on public.families;
drop policy if exists "family delete" on public.families;

create policy "family insert" on public.families
  for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());

create policy "family read" on public.families
  for select to authenticated
  using (public.is_admin() or (public.is_staff() and (
    created_by = auth.uid()
    or exists (select 1 from public.orphans o where o.family_id = families.id and o.created_by = auth.uid()))));

create policy "family update" on public.families
  for update to authenticated
  using (public.is_admin() or (public.is_staff() and (
    created_by = auth.uid()
    or exists (select 1 from public.orphans o where o.family_id = families.id and o.created_by = auth.uid()))))
  with check (public.is_admin() or public.is_staff());

create policy "family delete" on public.families
  for delete to authenticated using (public.is_admin());

-- ---------- دوال مساعدة (يستدعيها التطبيق) ----------

-- هل للمستخدم الحالي صلاحية على هذه العائلة؟
create or replace function public.can_access_family(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_staff() and exists (
    select 1 from public.families f where f.id = fid and (
      f.created_by = auth.uid()
      or exists (select 1 from public.orphans o where o.family_id = f.id and o.created_by = auth.uid()))));
$$;

-- أفراد العائلة المسجلون (الأسماء فقط + بيانات أساسية) لأي عائلة يصل لها المستخدم
create or replace function public.family_members(fid uuid)
returns table (id uuid, full_name text, orphan_code text, gender text, birth_date date, age int)
language sql stable security definer set search_path = public as $$
  select o.id, o.full_name, o.orphan_code, o.gender, o.birth_date, o.age
  from public.orphans o
  where o.family_id = fid and public.can_access_family(fid)
  order by o.birth_date nulls last, o.created_at;
$$;

-- بحث عن عائلة بالاسم أو رقم الهوية أو اسم الأم أو المعيل
create or replace function public.search_families(q text)
returns table (family_id uuid, orphan_name text, orphan_code text, mother_name text, guardian text, members int)
language sql stable security definer set search_path = public as $$
  select f.id, o.full_name, o.orphan_code, f.mother_name, f.guardian,
         (select count(*)::int from public.orphans x where x.family_id = f.id)
  from public.orphans o join public.families f on f.id = o.family_id
  where public.is_staff() and length(trim(q)) >= 3 and (
        o.full_name ilike '%' || trim(q) || '%'
     or o.orphan_code ilike '%' || trim(q) || '%'
     or f.mother_name ilike '%' || trim(q) || '%'
     or f.guardian ilike '%' || trim(q) || '%')
  order by o.created_at desc
  limit 15;
$$;

-- ربط يتيم بعائلة موجودة: يسمح للمسجِّل بقراءة العائلة التي ربط بها يتيمه فقط (بعد الربط)
revoke all on function public.can_access_family(uuid), public.family_members(uuid), public.search_families(text) from public, anon;
grant execute on function public.can_access_family(uuid), public.family_members(uuid), public.search_families(text) to authenticated;

-- قراءة عائلة كاملة عند ربط يتيم بها (للمسجِّل المفعّل فقط). بعد الربط تصبح عائلته ضمن صلاحياته العادية.
create or replace function public.get_family(fid uuid) returns setof public.families
language sql stable security definer set search_path = public as $$
  select * from public.families where id = fid and public.is_staff();
$$;
revoke all on function public.get_family(uuid) from public, anon;
grant execute on function public.get_family(uuid) to authenticated;
