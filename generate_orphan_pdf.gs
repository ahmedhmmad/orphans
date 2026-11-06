/**
 * إصدار استمارة اليتيم PDF بنفس شكل التصميم - مؤسسة الركيزة الثالثة
 *
 * خطوات الإعداد (مرة واحدة):
 * 1) ارفع الصورتين orphan_form_page1.png و orphan_form_page2.png إلى Google Drive (أي مكان).
 * 2) في نفس مشروع Apps Script (أو مشروع جديد) أضف ملف سكربت والصق هذا الكود.
 * 3) من القائمة الجانبية: Services (الخدمات) ➜ + ➜ اختر "Google Slides API" ➜ Add.
 * 4) ضع رابط تعديل الاستمارة في FORM_URL بالأسفل.
 * 5) شغّل الدوال بالترتيب: setupTemplate ثم installTrigger
 * 6) للتجربة على آخر رد موجود: شغّل generateLatest
 *
 * بعد ذلك: كل رد جديد على الاستمارة يُنتج ملف PDF تلقائياً داخل مجلد "استمارات الأيتام PDF" على Drive.
 * يمكنك فتح القالب في Google Slides وتحريك أو تكبير أي مربع {{...}} لضبط مكانه، دون تعديل الكود.
 */

const FORM_URL = 'ضع هنا رابط تعديل الاستمارة (ينتهي بـ /edit)';
const PAGE1_FILE = 'orphan_form_page1.png';
const PAGE2_FILE = 'orphan_form_page2.png';
const OUTPUT_FOLDER = 'استمارات الأيتام PDF';

// صفحة القالب: 540×720 نقطة، والإحداثيات أدناه بالبكسل على صور 1500×2000
const PAGE_W = 540, PAGE_H = 720, PX = PAGE_W / 1500;

// صفحات الاستمارة: 0 اليتيم، 1 الأب، 2 الأم، 3 وفاة الأم، 4 الإخوة، 5 الصحة، 6 السكن، 7 الوضع المالي
// [المفتاح, صفحة القالب, x1, y1, x2, y2, صفحة الاستمارة, بداية عنوان السؤال, النوع, حجم الخط]
const FIELDS = [
  ['photo',        1, 118, 82, 362, 322, 0, 'رابط صورة اليتيم', 'photo', 8],
  ['orphan_id',    1, 724, 440, 1134, 494, 0, 'الرقم التعريفي لليتيم', 'text', 10],
  ['nationality',  1, 68, 440, 486, 494, 0, 'الجنسية', 'text', 10],
  ['full_name',    1, 724, 508, 1148, 560, 0, 'الاسم الكامل', 'text', 10],
  ['dob',          1, 72, 510, 400, 560, 0, 'تاريخ الميلاد', 'date', 10],
  ['mobile',       1, 70, 576, 464, 628, 0, 'رقم الهاتف', 'text', 10],
  ['gender_m',     1, 1064, 576, 1114, 620, 0, 'الجنس', 'check:ذكر', 12],
  ['gender_f',     1, 870, 576, 920, 620, 0, 'الجنس', 'check:أنثى', 12],
  ['address',      1, 72, 646, 428, 758, 0, 'عنوان السكن الحالي', 'text', 8],
  ['age',          1, 724, 644, 1150, 694, 0, 'العمر', 'text', 10],
  ['arrival',      1, 728, 710, 1060, 758, 0, 'تاريخ الوصول إلى مصر', 'date', 10],
  ['spons_end',    1, 74, 776, 372, 824, 0, 'تاريخ انتهاء الكفالة', 'date', 10],
  ['spons_start',  1, 728, 776, 1060, 824, 0, 'تاريخ بدء الكفالة', 'date', 10],

  ['f_death',      1, 74, 946, 406, 992, 1, 'تاريخ الوفاة', 'date', 10],
  ['f_name',       1, 730, 944, 1180, 994, 1, 'اسم الأب', 'text', 10],
  ['f_cause',      1, 72, 1006, 472, 1056, 1, 'سبب الوفاة', 'text', 10],
  ['f_dob',        1, 732, 1010, 1090, 1054, 1, 'تاريخ الميلاد', 'date', 10],
  ['f_place',      1, 72, 1068, 472, 1118, 1, 'مكان الوفاة', 'text', 10],

  ['m_alive',      1, 454, 1218, 504, 1266, 2, 'الحالة', 'check:على قيد', 12],
  ['m_deceased',   1, 220, 1218, 270, 1266, 2, 'الحالة', 'check:متوفاة', 12],
  ['m_name',       1, 732, 1220, 1178, 1270, 2, 'اسم الأم', 'text', 10],
  ['m_death',      1, 74, 1280, 388, 1324, 3, 'تاريخ الوفاة', 'date', 10],
  ['m_dob',        1, 734, 1282, 1088, 1326, 2, 'تاريخ الميلاد', 'date', 10],
  ['m_cause',      1, 72, 1338, 456, 1386, 3, 'سبب الوفاة', 'text', 10],
  ['m_job',        1, 732, 1340, 1168, 1390, 2, 'المهنة', 'text', 10],
  ['m_phone',      1, 72, 1394, 456, 1440, 2, 'رقم الهاتف', 'text', 10],

  ['s1_name',      1, 892, 1620, 1328, 1660, 4, 'الاسم (1)', 'text', 9],
  ['s1_rel',       1, 646, 1620, 890, 1660, 4, 'صلة القرابة (1)', 'choice', 9],
  ['s1_dob',       1, 374, 1620, 644, 1660, 4, 'تاريخ الميلاد (1)', 'date', 9],
  ['s1_dod',       1, 72, 1620, 372, 1660, 4, 'تاريخ الوفاة إن وجد (1)', 'date', 9],
  ['s2_name',      1, 892, 1661, 1328, 1702, 4, 'الاسم (2)', 'text', 9],
  ['s2_rel',       1, 646, 1661, 890, 1702, 4, 'صلة القرابة (2)', 'choice', 9],
  ['s2_dob',       1, 374, 1661, 644, 1702, 4, 'تاريخ الميلاد (2)', 'date', 9],
  ['s2_dod',       1, 72, 1661, 372, 1702, 4, 'تاريخ الوفاة إن وجد (2)', 'date', 9],
  ['s3_name',      1, 892, 1703, 1328, 1744, 4, 'الاسم (3)', 'text', 9],
  ['s3_rel',       1, 646, 1703, 890, 1744, 4, 'صلة القرابة (3)', 'choice', 9],
  ['s3_dob',       1, 374, 1703, 644, 1744, 4, 'تاريخ الميلاد (3)', 'date', 9],
  ['s3_dod',       1, 72, 1703, 372, 1744, 4, 'تاريخ الوفاة إن وجد (3)', 'date', 9],
  ['s4_name',      1, 892, 1745, 1328, 1786, 4, 'الاسم (4)', 'text', 9],
  ['s4_rel',       1, 646, 1745, 890, 1786, 4, 'صلة القرابة (4)', 'choice', 9],
  ['s4_dob',       1, 374, 1745, 644, 1786, 4, 'تاريخ الميلاد (4)', 'date', 9],
  ['s4_dod',       1, 72, 1745, 372, 1786, 4, 'تاريخ الوفاة إن وجد (4)', 'date', 9],
  ['s5_name',      1, 892, 1787, 1328, 1826, 4, 'الاسم (5)', 'text', 9],
  ['s5_rel',       1, 646, 1787, 890, 1826, 4, 'صلة القرابة (5)', 'choice', 9],
  ['s5_dob',       1, 374, 1787, 644, 1826, 4, 'تاريخ الميلاد (5)', 'date', 9],
  ['s5_dod',       1, 72, 1787, 372, 1826, 4, 'تاريخ الوفاة إن وجد (5)', 'date', 9],

  ['ill',          2, 80, 458, 245, 500, 5, 'هل يعاني اليتيم من مرض أو إعاقة', 'choice', 10],
  ['ill_details',  2, 752, 458, 1062, 502, 5, 'نوع المرض أو الإصابة وتفاصيلها', 'text', 7],
  ['war',          2, 80, 542, 262, 586, 5, 'هل الإصابة ناتجة عن الحرب', 'choice', 10],
  ['treat',        2, 752, 542, 942, 586, 5, 'هل يحتاج إلى علاج مستمر', 'choice', 10],
  ['treat_cost',   2, 80, 626, 822, 668, 5, 'المصروف الشهري للعلاج والأدوية', 'text', 10],

  ['h_type',       2, 758, 816, 928, 858, 6, 'نوع السكن', 'choice', 10],
  ['h_address',    2, 84, 814, 438, 858, 6, 'عنوان السكن بالتفصيل', 'text', 8],
  ['h_members',    2, 758, 900, 938, 944, 6, 'عدد أفراد الأسرة المقيمين في السكن', 'text', 10],
  ['h_rent',       2, 84, 900, 352, 944, 6, 'قيمة الإيجار الشهري', 'text', 10],

  ['orphans',      2, 752, 1092, 1122, 1134, 7, 'عدد الأيتام', 'text', 10],
  ['fam_total',    2, 84, 1092, 382, 1134, 7, 'عدد أفراد الأسرة', 'text', 10],
  ['guardian',     2, 752, 1166, 982, 1210, 7, 'اسم المعيل وصلة القرابة', 'text', 8],
  ['income_src',   2, 84, 1166, 432, 1210, 7, 'مصدر دخل الأسرة', 'text', 9],
  ['avg_income',   2, 84, 1242, 278, 1284, 7, 'متوسط دخل الأسرة الشهري', 'text', 10],
  ['support_yes',  2, 892, 1228, 942, 1276, 7, 'هل تتلقى الأسرة مساعدات', 'check:نعم', 12],
  ['support_no',   2, 784, 1228, 834, 1276, 7, 'هل تتلقى الأسرة مساعدات', 'check:لا', 12],

  ['exp_rent',     2, 94, 1388, 390, 1444, 7, 'الإيجار', 'text', 11],
  ['exp_food',     2, 94, 1446, 390, 1502, 7, 'الطعام والشراب', 'text', 11],
  ['exp_treat',    2, 94, 1504, 390, 1560, 7, 'العلاج والأدوية', 'text', 11],
  ['exp_edu',      2, 94, 1562, 390, 1620, 7, 'التعليم والمواصلات', 'text', 11],
  ['exp_other',    2, 94, 1622, 390, 1680, 7, 'مصروفات أخرى', 'text', 11],
  ['exp_total',    2, 94, 1682, 390, 1748, 7, 'الإجمالي', 'text', 12],
];

const INK = '#0B2A5B';
const FONT = 'Cairo';

// ===================== الإعداد =====================

/** يُنشئ قالب Google Slides بخلفية التصميم ومربعات {{...}} في أماكن الخانات */
function setupTemplate() {
  if (typeof Slides === 'undefined') {
    throw new Error('فعّل خدمة "Google Slides API" من Services في القائمة الجانبية ثم أعد التشغيل.');
  }
  const bg = [findDriveFile_(PAGE1_FILE), findDriveFile_(PAGE2_FILE)];

  const created = Slides.Presentations.create({
    title: 'قالب استمارة الأيتام - THIRD PILLAR',
    pageSize: { width: { magnitude: PAGE_W, unit: 'PT' }, height: { magnitude: PAGE_H, unit: 'PT' } },
  });
  const pres = SlidesApp.openById(created.presentationId);

  const first = pres.getSlides()[0];
  first.getPageElements().forEach(e => e.remove());
  const slides = [first, pres.appendSlide(SlidesApp.PredefinedLayout.BLANK)];
  slides[1].getPageElements().forEach(e => e.remove());
  slides.forEach((s, i) => s.getBackground().setPictureFill(bg[i].getBlob()));

  FIELDS.forEach(([key, pg, x1, y1, x2, y2, , , type, size]) => {
    const box = slides[pg - 1].insertTextBox(
      '{{' + key + '}}', x1 * PX, y1 * PX, (x2 - x1) * PX, (y2 - y1) * PX
    );
    box.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
    // خلفية بيضاء تغطي "/ /" والنقاط المطبوعة (تُزال تلقائياً إذا كانت الخانة فارغة)
    if (type !== 'photo' && !type.startsWith('check')) box.getFill().setSolidFill('#FFFFFF');
    const t = box.getText();
    t.getTextStyle().setFontFamily(FONT).setFontSize(size).setBold(type.startsWith('check')).setForegroundColor(INK);
    t.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  });
  pres.saveAndClose();

  const props = PropertiesService.getScriptProperties();
  props.setProperty('TEMPLATE_ID', created.presentationId);
  Logger.log('تم إنشاء القالب: https://docs.google.com/presentation/d/' + created.presentationId + '/edit');
}

/** يُشغّل الإصدار تلقائياً مع كل رد جديد */
function installTrigger() {
  const form = getForm_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onOrphanFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onOrphanFormSubmit').forForm(form).onFormSubmit().create();
  Logger.log('تم تفعيل الإصدار التلقائي لملفات PDF.');
}

// ===================== الإصدار =====================

function onOrphanFormSubmit(e) {
  generatePdf_(e.response);
}

/** تجربة: يُصدر PDF لآخر رد */
function generateLatest() {
  const rs = getForm_().getResponses();
  if (!rs.length) throw new Error('لا توجد ردود بعد على الاستمارة.');
  generatePdf_(rs[rs.length - 1]);
}

/** يُصدر PDF لكل الردود الموجودة */
function generateAll() {
  getForm_().getResponses().forEach(generatePdf_);
}

function generatePdf_(response) {
  const templateId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID');
  if (!templateId) throw new Error('شغّل setupTemplate أولاً.');

  const answers = collectAnswers_(response);
  const values = {};
  FIELDS.forEach(([key, , , , , , page, title, type]) => {
    values[key] = formatValue_(answers[page + '|' + title], type);
  });

  const fileName = [values.orphan_id, values.full_name].filter(String).join(' - ') || 'استمارة يتيم';
  const folder = getFolder_(OUTPUT_FOLDER);
  const copy = DriveApp.getFileById(templateId).makeCopy(fileName, folder);
  const pres = SlidesApp.openById(copy.getId());

  placePhoto_(pres, values.photo);
  pres.getSlides().forEach(s => s.getShapes().forEach(shape => {
    const m = shape.getText().asString().match(/\{\{(\w+)\}\}/);
    if (m && !values[m[1]]) shape.getFill().setTransparent();
  }));
  FIELDS.forEach(([key]) => {
    if (key !== 'photo') pres.replaceAllText('{{' + key + '}}', values[key] || '');
  });
  pres.saveAndClose();

  const old = folder.getFilesByName(fileName + '.pdf');
  while (old.hasNext()) old.next().setTrashed(true); // استبدال النسخة القديمة عند تعديل الرد
  const pdf = folder.createFile(copy.getAs(MimeType.PDF)).setName(fileName + '.pdf');
  copy.setTrashed(true);
  Logger.log('تم إصدار: ' + pdf.getUrl());
  return pdf;
}

// ===================== أدوات =====================

/** يجمع الإجابات بمفتاح "رقم الصفحة|بداية العنوان العربي" لتمييز الأسئلة المتشابهة (مثل تاريخ الوفاة للأب والأم) */
function collectAnswers_(response) {
  const pageOf = {};
  let pg = 0;
  getForm_().getItems().forEach(it => {
    if (it.getType() === FormApp.ItemType.PAGE_BREAK) pg++;
    else pageOf[it.getId()] = pg;
  });
  const out = {};
  response.getItemResponses().forEach(ir => {
    const item = ir.getItem();
    const page = pageOf[item.getId()];
    const arTitle = item.getTitle().split('|')[0].trim();
    FIELDS.forEach(f => {
      if (f[6] === page && arTitle.startsWith(f[7])) out[page + '|' + f[7]] = ir.getResponse();
    });
  });
  return out;
}

function formatValue_(v, type) {
  if (v === undefined || v === null || v === '') return '';
  v = String(v).trim();
  if (type === 'date') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]} / ${m[2]} / ${m[1]}` : v;
  }
  if (type === 'choice') return v.split(' / ')[0];
  if (type.startsWith('check:')) return v.startsWith(type.slice(6)) ? '✔' : '';
  return v;
}

function placePhoto_(pres, link) {
  pres.getSlides().forEach(slide => slide.getShapes().forEach(shape => {
    if (shape.getText().asString().indexOf('{{photo}}') === -1) return;
    const L = shape.getLeft(), T = shape.getTop(), W = shape.getWidth(), H = shape.getHeight();
    shape.remove();
    const id = link && (link.match(/[-\w]{25,}/) || [])[0];
    if (!id) return;
    try {
      const img = slide.insertImage(DriveApp.getFileById(id).getBlob());
      const s = Math.min(W / img.getWidth(), H / img.getHeight());
      const w = img.getWidth() * s, h = img.getHeight() * s;
      img.setWidth(w).setHeight(h).setLeft(L + (W - w) / 2).setTop(T + (H - h) / 2);
    } catch (err) {
      Logger.log('تعذّر إدراج صورة اليتيم: ' + err);
    }
  }));
}

function getForm_() {
  const id = (FORM_URL.match(/\/d\/([-\w]+)/) || [])[1];
  if (!id) throw new Error('ضع رابط تعديل الاستمارة في FORM_URL أعلى الملف.');
  return FormApp.openById(id);
}

function findDriveFile_(name) {
  const it = DriveApp.getFilesByName(name);
  if (!it.hasNext()) throw new Error('ارفع الملف ' + name + ' إلى Google Drive أولاً.');
  return it.next();
}

function getFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
