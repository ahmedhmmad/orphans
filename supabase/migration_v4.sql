-- =====================================================================
-- الإصدار 4: إضافة «مكفول» إلى أنواع السكن
-- شغّله بعد migration_v3.sql:  SQL Editor ➜ New query ➜ Run
-- =====================================================================

alter table public.orphans drop constraint if exists orphans_housing_type_check;
alter table public.orphans
  add constraint orphans_housing_type_check
  check (housing_type in ('owned', 'rented', 'temporary', 'shared', 'sponsored'));
