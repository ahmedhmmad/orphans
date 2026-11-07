-- =====================================================================
-- الإصدار 6: صلة قرابة المعيل في عمود مستقل
-- شغّله بعد migration_v5.sql:  SQL Editor ➜ New query ➜ Run
-- =====================================================================

alter table public.families add column if not exists guardian_relation text;
