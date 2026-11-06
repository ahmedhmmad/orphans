// Edge Function: manage-users
// إدارة حسابات المسجلين من لوحة التحكم. تعمل بصلاحية service_role على الخادم فقط،
// ولا تقبل إلا طلبات من مشرف مفعّل. المفتاح السري لا يظهر في الموقع أبداً.
//
// النشر: Supabase ➜ Edge Functions ➜ Deploy a new function ➜ Via Editor
//        الاسم: manage-users  ➜ الصق هذا الكود ➜ Deploy
//        (أوقف خيار "Verify JWT" لأن الدالة تتحقق بنفسها من هوية المستخدم)

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ROLES = ['admin', 'registrar'];
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // 1) من المتصل؟
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await db.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: 'غير مصرّح، سجّل الدخول من جديد' }, 401);
    const me = who.user.id;

    // 2) هل هو مشرف مفعّل؟
    const { data: prof } = await db.from('profiles').select('role, active').eq('id', me).maybeSingle();
    if (!prof?.active || prof.role !== 'admin') return json({ error: 'هذه العملية للمشرف فقط' }, 403);

    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case 'list': {
        const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;
        const { data: profiles } = await db.from('profiles').select('*');
        const map = new Map((profiles ?? []).map((p) => [p.id, p]));
        const users = list.users
          .filter((u) => map.has(u.id))
          .map((u) => ({
            id: u.id,
            email: u.email,
            last_sign_in_at: u.last_sign_in_at,
            ...map.get(u.id),
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return json({ users });
      }

      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const full_name = String(body.full_name ?? '').trim();
        const username = String(body.username ?? '').trim().toLowerCase();
        const role = ROLES.includes(body.role) ? body.role : 'registrar';
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'البريد الإلكتروني غير صحيح' }, 400);
        if (password.length < 8) return json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, 400);
        if (!full_name) return json({ error: 'اسم المسجِّل مطلوب' }, 400);
        if (!USERNAME_RE.test(username)) return json({ error: 'اسم المستخدم: 3-30 حرفاً إنجليزياً أو أرقاماً أو . _ -' }, 400);
        const { data: taken } = await db.from('profiles').select('id').ilike('username', username).maybeSingle();
        if (taken) return json({ error: 'اسم المستخدم مستخدم من قبل' }, 400);

        const { data: created, error } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        });
        if (error) {
          const dup = /already|registered|exists/i.test(error.message);
          return json({ error: dup ? 'هذا البريد مسجّل من قبل' : error.message }, 400);
        }
        const { error: pErr } = await db.from('profiles').insert({ id: created.user.id, full_name, username, role });
        if (pErr) {
          await db.auth.admin.deleteUser(created.user.id);
          throw pErr;
        }
        return json({ ok: true, id: created.user.id });
      }

      case 'update': {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'المستخدم غير محدد' }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof body.active === 'boolean') patch.active = body.active;
        if (typeof body.full_name === 'string' && body.full_name.trim()) patch.full_name = body.full_name.trim();
        if (ROLES.includes(body.role)) patch.role = body.role;
        if (body.username !== undefined) {
          const un = String(body.username).trim().toLowerCase();
          if (!USERNAME_RE.test(un)) return json({ error: 'اسم المستخدم: 3-30 حرفاً إنجليزياً أو أرقاماً أو . _ -' }, 400);
          const { data: taken } = await db.from('profiles').select('id').ilike('username', un).neq('id', id).maybeSingle();
          if (taken) return json({ error: 'اسم المستخدم مستخدم من قبل' }, 400);
          patch.username = un;
        }
        if (id === me && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
          return json({ error: 'لا يمكنك تعطيل حسابك أو إنزال صلاحيتك' }, 400);
        }
        if (body.password !== undefined) {
          if (String(body.password).length < 8) return json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' }, 400);
          const { error } = await db.auth.admin.updateUserById(id, { password: String(body.password) });
          if (error) throw error;
        }
        if (Object.keys(patch).length) {
          const { error } = await db.from('profiles').update(patch).eq('id', id);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      case 'delete': {
        const id = String(body.id ?? '');
        if (!id) return json({ error: 'المستخدم غير محدد' }, 400);
        if (id === me) return json({ error: 'لا يمكنك حذف حسابك' }, 400);
        const { error } = await db.auth.admin.deleteUser(id);
        if (error) throw error;
        return json({ ok: true });
      }

      default:
        return json({ error: 'عملية غير معروفة' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'خطأ غير متوقع' }, 500);
  }
});
