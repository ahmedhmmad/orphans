# نظام تسجيل بيانات الأيتام — THIRD PILLAR

موقع ثابت على **GitHub Pages** + قاعدة بيانات **Supabase**.

| الصفحة | الوظيفة |
|---|---|
| `docs/index.html` | لوحة التحكم: دخول، الرئيسية (عدد المسجَّلين اليوم)، تسجيل يتيم، السجلات، المستخدمون |
| `docs/paper.html` | الاستمارة الورقية (A4 صفحتان) — تُفتح تلقائياً للطباعة بعد كل حفظ |
| `supabase/schema.sql` | الجدول ومخزن الصور (الإصدار 1) |
| `supabase/migration_v2.sql` … `migration_v5.sql` | الأدوار، اسم المستخدم، السكن المكفول، **العائلات المشتركة** (شغّلها بالترتيب) |
| `supabase/functions/manage-users/index.ts` | دالة آمنة لإنشاء حسابات المسجِّلين من لوحة التحكم |

## الصلاحيات
- **المشرف**: يرى كل السجلات، يعدّل ويحذف ويصدّر Excel، وينشئ حسابات المسجِّلين.
- **المسجِّل**: يسجّل أيتاماً ويرى ويعدّل ما أدخله هو فقط، ويطبع استماراته.
- الزائر بدون حساب لا يستطيع قراءة أو إضافة أي شيء.

## الإعداد (مرة واحدة)

1. **تشغيل `schema.sql`** ثم **`migration_v2.sql`** من *SQL Editor* في Supabase.
   (الحسابات الموجودة في Authentication وقت التشغيل تصبح «مشرف»، فتأكد أنها حسابك فقط.)
2. **نشر دالة إدارة المستخدمين**: *Edge Functions ➜ Deploy a new function ➜ Via Editor*
   - الاسم: `manage-users` (بالضبط)
   - الصق محتوى `supabase/functions/manage-users/index.ts`
   - أوقف خيار **Verify JWT** (الدالة تتحقق من المشرف بنفسها) ثم **Deploy**.
3. في *Authentication ➜ Sign In / Providers ➜ Email* أوقف **Allow new users to sign up**.
4. المفتاح العام في `docs/js/config.js` (Publishable key فقط، لا تضع مفتاح secret / service_role أبداً).

## الاستخدام
- ادخل على `https://ahmedhmmad.github.io/orphans/` ← **المستخدمون** ← أنشئ حساب مسجِّل (اسم + بريد + كلمة مرور) وسلّمه البيانات.
- المسجِّل يدخل ← **تسجيل يتيم** ← يملأ النموذج ← **حفظ وطباعة**: تُفتح نافذة الطباعة بالاستمارة الورقية.
  في نافذة الطباعة اختر المقاس A4 والهوامش *None* وفعّل *Background graphics*.

## التجربة محلياً
```bash
npx http-server docs -p 5173
```
