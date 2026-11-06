-- =====================================================================
-- الإصدار 3: تسجيل الدخول باسم المستخدم أو البريد
-- شغّله بعد migration_v2.sql:  SQL Editor ➜ New query ➜ Run
-- =====================================================================

alter table public.profiles add column if not exists username text;

-- اسم مستخدم مبدئي للحسابات الحالية = الجزء الذي قبل @ في البريد
update public.profiles p
set username = lower(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'))
from auth.users u
where u.id = p.id and p.username is null;

create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- تحويل اسم المستخدم إلى بريد قبل تسجيل الدخول (يُرجع البريد فقط، ولا يكشف بيانات أخرى)
create or replace function public.email_for_username(u text) returns text
language sql stable security definer set search_path = public, auth as $$
  select au.email::text
  from public.profiles p join auth.users au on au.id = p.id
  where lower(p.username) = lower(trim(u)) and p.active
  limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;
