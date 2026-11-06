// إعدادات الاتصال بـ Supabase
// المفتاح المطلوب هنا هو المفتاح العام (Publishable / anon) فقط — آمن للوضع في الموقع
// لأن صلاحيات الجدول محمية بـ Row Level Security.
// ⚠️ لا تضع هنا مفتاح service_role / secret أبداً.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://bzaheeyodulinlzinbyb.supabase.co',
  SUPABASE_ANON_KEY: 'ضع_هنا_المفتاح_العام_Publishable_key',
  PHOTO_BUCKET: 'orphan-photos',
};
