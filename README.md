# استمارة تسجيل بيانات الأيتام — THIRD PILLAR

موقع ثابت (HTML) يُستضاف على **GitHub Pages**، والبيانات تُحفظ في **Supabase**.

| الصفحة | الوظيفة |
|---|---|
| `docs/index.html` | استمارة التسجيل (للجميع) — نفس شكل الاستمارة الورقية، وتُطبع على صفحتي A4 |
| `docs/admin.html` | لوحة المشرف: تسجيل دخول، قائمة السجلات، بحث، عرض/تعديل/طباعة، حذف، تصدير Excel |
| `supabase/schema.sql` | إنشاء الجدول والصلاحيات ومخزن الصور |

## 1) إعداد Supabase (مرة واحدة)

1. افتح مشروع **Orphans** ➜ **SQL Editor** ➜ **New query** ➜ الصق محتوى `supabase/schema.sql` ➜ **Run**.
2. **Authentication ➜ Sign In / Providers ➜ Email**: أوقف **Allow new users to sign up**.
   ⚠️ هذه الخطوة مهمة جداً: أي حساب مسجّل يستطيع قراءة بيانات الأيتام، لذلك يجب ألا يستطيع أي شخص إنشاء حساب بنفسه.
3. **Authentication ➜ Users ➜ Add user ➜ Create new user**: أنشئ حساب المشرف (بريد + كلمة مرور) وفعّل **Auto Confirm User**.
4. **Project Settings ➜ API Keys**: انسخ المفتاح العام (**Publishable key** أو **anon public**) وضعه في `docs/js/config.js` مكان `SUPABASE_ANON_KEY`.
   لا تستخدم أبداً مفتاح `service_role` / `secret`.

## 2) النشر على GitHub Pages

1. أنشئ مستودعاً جديداً على GitHub (`orphans`) وارفع محتويات هذا المجلد.
2. **Settings ➜ Pages ➜ Build and deployment**: Source = **Deploy from a branch**، Branch = `main`، Folder = **`/docs`** ➜ Save.
3. بعد دقيقة يصبح الموقع على: `https://<اسم-حسابك>.github.io/orphans/`
   - الاستمارة: الرابط أعلاه
   - لوحة المشرف: `.../orphans/admin.html`

## 3) الاستخدام

- **التسجيل**: أي شخص يفتح الرابط يملأ الاستمارة ويضغط «إرسال البيانات». الصورة تُصغَّر تلقائياً قبل الرفع (أي مقاس).
- **الطباعة / PDF**: زر «طباعة / PDF» ثم اختر *Save as PDF*، والمقاس A4، والهوامش *None*، وفعّل *Background graphics*.
- **المشرف**: يدخل من `admin.html` ➜ يضغط «عرض / تعديل / طباعة» على أي سجل لفتح الاستمارة مملوءة بنفس التصميم.

## التجربة محلياً

```bash
npx http-server docs -p 5173
```
