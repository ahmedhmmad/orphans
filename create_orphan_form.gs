/**
 * استمارة تسجيل بيانات الأيتام - مؤسسة الركيزة الثالثة
 * Orphan Registration Form - THIRD PILLAR
 *
 * طريقة الاستخدام:
 * 1) افتح https://script.google.com  ثم "مشروع جديد"
 * 2) احذف الكود الموجود والصق هذا الملف كاملاً
 * 3) اختر الدالة createOrphanForm واضغط "تشغيل" ووافق على الصلاحيات
 * 4) افتح "سجل التنفيذ" (Execution log) لتجد رابط الاستمارة ورابط التعديل ورابط شيت الردود
 */

function createOrphanForm() {
  const form = FormApp.create('استمارة تسجيل بيانات الأيتام | Orphan Registration Form');
  form
    .setDescription(
      'مؤسسة الركيزة الثالثة | THIRD PILLAR\n' +
      'returning favours bestowed upon us\n\n' +
      'برجاء ملء جميع البيانات بدقة. الحقول المعلَّمة بـ * إلزامية.\n' +
      'Please fill in all information accurately. Fields marked * are required.'
    )
    .setProgressBar(true)
    .setAllowResponseEdits(true)
    .setConfirmationMessage(
      'شكراً لكم، تم تسجيل بيانات اليتيم بنجاح.\nThank you, the orphan data has been registered successfully.\n\nTHIRD PILLAR | Returning favours bestowed upon us'
    );

  // ---------- أدوات مساعدة ----------
  const V = FormApp.createTextValidation;
  const numberV = () => V().requireNumberGreaterThanOrEqualTo(0)
    .setHelpText('برجاء إدخال رقم صحيح / Please enter a valid number').build();
  const phoneV = () => V().requireTextMatchesPattern('^\\+?[0-9 ]{8,16}$')
    .setHelpText('برجاء إدخال رقم هاتف صحيح / Please enter a valid phone number').build();

  const text = (t, req, help) => {
    const i = form.addTextItem().setTitle(t).setRequired(!!req);
    if (help) i.setHelpText(help);
    return i;
  };
  const num = (t, req) => text(t, req).setValidation(numberV());
  const phone = (t, req) => text(t, req).setValidation(phoneV());
  const para = (t, req) => form.addParagraphTextItem().setTitle(t).setRequired(!!req);
  const date = (t, req) => form.addDateItem().setTitle(t).setRequired(!!req);
  const choice = (t, opts, req) =>
    form.addMultipleChoiceItem().setTitle(t).setChoiceValues(opts).setRequired(!!req);
  const yesNo = (t, req) => choice(t, ['نعم / Yes', 'لا / No'], req);
  const page = (t, d) => {
    const p = form.addPageBreakItem().setTitle(t);
    if (d) p.setHelpText(d);
    return p;
  };

  // ---------- 1. البيانات الشخصية لليتيم ----------
  form.addSectionHeaderItem()
    .setTitle('1. البيانات الشخصية لليتيم | Orphan Personal Information');
  text('الرقم التعريفي لليتيم | Orphan ID', true);
  text('الاسم الكامل | Full Name', true);
  choice('الجنس | Gender', ['ذكر / Male', 'أنثى / Female'], true);
  text('العمر | Age', true).setValidation(
    V().requireNumberBetween(0, 25).setHelpText('العمر بين 0 و 25 / Age between 0 and 25').build()
  );
  text('الجنسية | Nationality', true);
  date('تاريخ الميلاد | Date of Birth', true);
  phone('رقم الهاتف | Mobile Number', true);
  date('تاريخ الوصول إلى مصر | Date of Arrival in Egypt', false);
  para('عنوان السكن الحالي | Current Address', true);
  date('تاريخ بدء الكفالة | Sponsorship Start Date', false);
  date('تاريخ انتهاء الكفالة | Sponsorship End Date', false);
  text('رابط صورة اليتيم (اختياري) | Orphan Photo Link (optional)', false,
    'ارفع الصورة على Google Drive وضع رابطها هنا / Upload to Google Drive and paste the link');

  // ---------- 2. بيانات الأب ----------
  page('2. بيانات الأب | Father\'s Information');
  text('اسم الأب | Father\'s Name', true);
  date('تاريخ الميلاد | Date of Birth', false);
  date('تاريخ الوفاة | Date of Death', true);
  text('سبب الوفاة | Cause of Death', true);
  text('مكان الوفاة | Place of Death', false);

  // ---------- 3. بيانات الأم ----------
  page('3. بيانات الأم | Mother\'s Information');
  text('اسم الأم | Mother\'s Name', true);
  date('تاريخ الميلاد | Date of Birth', false);
  text('المهنة | Occupation', false);
  phone('رقم الهاتف | Mobile Number', false);
  const motherStatus = form.addMultipleChoiceItem()
    .setTitle('الحالة | Status').setRequired(true);

  const motherDeathPage = page('3. بيانات الأم - الوفاة | Mother\'s Death Details');
  date('تاريخ الوفاة | Date of Death', true);
  text('سبب الوفاة | Cause of Death', true);

  // ---------- 4. بيانات الإخوة والأخوات ----------
  const siblingsPage = page('4. بيانات الإخوة والأخوات | Siblings Information',
    'أدخل بيانات حتى 5 إخوة، واترك الباقي فارغاً / Enter up to 5 siblings, leave the rest empty');
  num('عدد الإخوة والأخوات | Number of Siblings', true);
  for (let n = 1; n <= 5; n++) {
    form.addSectionHeaderItem().setTitle(`الأخ / الأخت رقم ${n} | Sibling No. ${n}`);
    text(`الاسم (${n}) | Name (${n})`, false);
    choice(`صلة القرابة (${n}) | Relation (${n})`,
      ['أخ شقيق / Full Brother', 'أخت شقيقة / Full Sister', 'أخ غير شقيق / Half Brother', 'أخت غير شقيقة / Half Sister'], false);
    date(`تاريخ الميلاد (${n}) | Date of Birth (${n})`, false);
    date(`تاريخ الوفاة إن وجد (${n}) | Date of Death if applicable (${n})`, false);
  }

  // توجيه سؤال حالة الأم: متوفاة → صفحة الوفاة، على قيد الحياة → الإخوة
  motherStatus.setChoices([
    motherStatus.createChoice('على قيد الحياة / Alive', siblingsPage),
    motherStatus.createChoice('متوفاة / Deceased', motherDeathPage),
  ]);

  // ---------- 5. الحالة الصحية ----------
  page('5. الحالة الصحية | Health Status');
  yesNo('هل يعاني اليتيم من مرض أو إعاقة؟ | Does the orphan suffer from an illness or disability?', true);
  para('نوع المرض أو الإصابة وتفاصيلها | Type of Illness or Injury & Details', false);
  yesNo('هل الإصابة ناتجة عن الحرب؟ | Is the injury a result of the war?', false);
  yesNo('هل يحتاج إلى علاج مستمر؟ | Does the orphan need continuous treatment?', false);
  num('المصروف الشهري للعلاج والأدوية (جنيه مصري) | Monthly Cost of Treatment & Medication (EGP)', false);

  // ---------- 6. بيانات السكن ----------
  page('6. بيانات السكن | Housing Information');
  choice('نوع السكن | Type of Housing',
    ['ملك / Owned', 'إيجار / Rented', 'مؤقت / Temporary', 'مشترك / Shared'], true);
  para('عنوان السكن بالتفصيل | Full Address of Residence', true);
  num('عدد أفراد الأسرة المقيمين في السكن | Number of Family Members Living in the Residence', true);
  num('قيمة الإيجار الشهري (جنيه مصري) | Monthly Rent Amount (EGP)', false);

  // ---------- 7. الوضع المالي والمعيشي للأسرة ----------
  page('7. الوضع المالي والمعيشي للأسرة | Family Financial & Living Situation');
  num('عدد الأيتام | Number of Orphans', true);
  num('عدد أفراد الأسرة | Total Number of Family Members', true);
  text('اسم المعيل وصلة القرابة | Name of the Family Guardian & Relationship', true);
  text('مصدر دخل الأسرة | Family Source of Income', true);
  num('متوسط دخل الأسرة الشهري (جنيه مصري) | Average Monthly Family Income (EGP)', true);
  yesNo('هل تتلقى الأسرة مساعدات من جهات أخرى؟ | Does the family receive support from other organizations?', true);

  form.addSectionHeaderItem()
    .setTitle('المصروفات الشهرية (جنيه مصري) | Monthly Expenses (EGP)');
  num('الإيجار | Rent', false);
  num('الطعام والشراب | Food & Beverages', false);
  num('العلاج والأدوية | Treatment & Medication', false);
  num('التعليم والمواصلات | Education & Transportation', false);
  num('مصروفات أخرى | Other Expenses', false);
  num('الإجمالي | Total', true);

  // ---------- ربط الردود بجدول Google Sheets ----------
  const ss = SpreadsheetApp.create('ردود - استمارة تسجيل بيانات الأيتام');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('رابط الاستمارة للمستخدمين: ' + form.getPublishedUrl());
  Logger.log('رابط تعديل الاستمارة: ' + form.getEditUrl());
  Logger.log('رابط شيت الردود: ' + ss.getUrl());
}
