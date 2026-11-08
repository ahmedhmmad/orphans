// Edge Function: send-whatsapp
// جسر آمن بين لوحة الأيتام ومنصة SendWhats. مفتاح SendWhats يبقى سراً هنا على الخادم فقط،
// ولا تقبل الدالة إلا طلبات من مشرف مفعّل.
//
// الأسرار المطلوبة (Edge Functions ➜ Secrets):
//   SENDWHATS_API_KEY  مفتاح API من كونسول SendWhats (صفحة API keys) — للمالك فقط
//   SENDWHATS_API_URL  (اختياري) الافتراضي https://api.sendwhats.141.147.106.208.sslip.io
//
// النشر: Edge Functions ➜ Deploy a new function ➜ Via Editor ➜ الاسم: send-whatsapp
//        أوقف "Verify JWT" (الدالة تتحقق بنفسها).

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // 1) المتصل مشرف مفعّل؟
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await db.auth.getUser(token);
    if (whoErr || !who?.user) return json({ error: 'غير مصرّح، سجّل الدخول من جديد' }, 401);
    const { data: prof } = await db.from('profiles').select('role, active').eq('id', who.user.id).maybeSingle();
    if (!prof?.active || prof.role !== 'admin') return json({ error: 'إرسال الرسائل للمشرف فقط' }, 403);

    // 2) إعدادات SendWhats
    const key = Deno.env.get('SENDWHATS_API_KEY');
    if (!key) return json({ error: 'لم يُضبط السر SENDWHATS_API_KEY في أسرار الدالة' }, 500);
    const base = (Deno.env.get('SENDWHATS_API_URL') ?? 'https://api.sendwhats.141.147.106.208.sslip.io').replace(/\/$/, '');
    const headers = { 'X-Api-Key': key, 'Content-Type': 'application/json' };

    const body = await req.json().catch(() => ({}));

    if (body.action === 'send') {
      const batchId = String(body.batchId ?? '').trim();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!/^[\w.\-]{3,100}$/.test(batchId)) return json({ error: 'معرّف الدفعة غير صالح' }, 400);
      if (!messages.length || messages.length > 500) return json({ error: 'عدد الرسائل يجب أن يكون بين 1 و500' }, 400);
      const clean = messages.map((m: Record<string, unknown>) => ({
        externalId: String(m.externalId ?? '').slice(0, 120),
        phone: String(m.phone ?? '').slice(0, 40),
        text: String(m.text ?? '').trim().slice(0, 4000),
      }));
      if (clean.some((m: { externalId: string; phone: string; text: string }) => !m.externalId || !m.phone || !m.text)) {
        return json({ error: 'رسالة ناقصة (معرّف أو رقم أو نص فارغ)' }, 400);
      }
      const r = await fetch(`${base}/api/v1/external/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ batchId, messages: clean }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: data?.error?.message ?? `رفض SendWhats الطلب (${r.status})` }, r.status === 401 ? 502 : r.status);
      return json(data);
    }

    if (body.action === 'status') {
      const batchId = String(body.batchId ?? '').trim();
      if (!/^[\w.\-]{3,100}$/.test(batchId)) return json({ error: 'معرّف الدفعة غير صالح' }, 400);
      const r = await fetch(`${base}/api/v1/external/batches/${encodeURIComponent(batchId)}`, { headers });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: data?.error?.message ?? `تعذّر قراءة الحالة (${r.status})` }, r.status === 401 ? 502 : r.status);
      return json(data);
    }

    return json({ error: 'عملية غير معروفة' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message ?? 'خطأ غير متوقع' }, 500);
  }
});
