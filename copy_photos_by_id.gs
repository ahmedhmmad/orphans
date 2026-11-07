/**
 * نسخ صور اليتامى من فورم جوجل إلى مجلد واحد، كل صورة باسم رقم هوية اليتيم (مثال: 445813496.jpg)
 *
 * طريقة الاستخدام:
 * 1) افتح ملف Google Sheet الخاص بردود الفورم (الذي يحوي عمود «Orphan Photo»).
 * 2) من القائمة: Extensions (الإضافات) ➜ Apps Script، ثم الصق هذا الكود مكان الموجود.
 * 3) اختر الدالة copyPhotos واضغط Run ووافق على الصلاحيات (Drive).
 * 4) إن توقف السكربت برسالة "أعد التشغيل" فشغّله ثانية، يكمل من حيث توقف.
 * 5) في Drive ستجد مجلد «صور الأيتام بالهوية»: انقر عليه بالزر الأيمن ➜ Download، ثم فك الضغط.
 * 6) في لوحة التحكم ➜ «رفع صور» ➜ اختر كل الصور المفكوكة.
 *
 * ملاحظة: الأصل لا يتغير، هذه نسخ جديدة. وإن تكرر رقم الهوية في عدة ردود تُؤخذ صورة آخر رد.
 */

const OUT_FOLDER = 'صور الأيتام بالهوية';
const MAX_MS = 5 * 60 * 1000; // حد زمن التشغيل الواحد (سقف Apps Script ‏6 دقائق)

function copyPhotos() {
  const started = Date.now();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const head = values[0].map(h => String(h));
  const idCol = head.findIndex(h => /Orphan ID/i.test(h) || /رقم هوية/.test(h));
  const photoCol = head.findIndex(h => /Orphan Photo/i.test(h) || /صورة اليتيم/.test(h));
  if (idCol < 0 || photoCol < 0) throw new Error('لم أجد عمودي رقم الهوية والصورة في أول ورقة');

  // آخر رد لكل رقم هوية
  const last = {};
  values.slice(1).forEach((r, i) => {
    const id = String(r[idCol]).trim();
    const link = String(r[photoCol]).trim();
    if (id && link) last[id] = { link, row: i + 2 };
  });

  const it = DriveApp.getFoldersByName(OUT_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(OUT_FOLDER);
  const existing = new Set();
  const files = folder.getFiles();
  while (files.hasNext()) existing.add(files.next().getName().replace(/\.[^.]+$/, ''));

  let copied = 0, skipped = 0;
  const failed = [];
  const ids = Object.keys(last);
  for (const id of ids) {
    if (existing.has(safe(id))) { skipped++; continue; }
    if (Date.now() - started > MAX_MS) {
      Logger.log(`توقف مؤقتاً بعد نسخ ${copied}. أعد التشغيل لإكمال الباقي.`);
      return;
    }
    try {
      const m = last[id].link.match(/[-\w]{25,}/);
      if (!m) throw new Error('رابط غير مفهوم');
      const src = DriveApp.getFileById(m[0]);
      const ext = (src.getName().match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0].toLowerCase();
      src.makeCopy(safe(id) + ext, folder);
      copied++;
    } catch (e) {
      failed.push(`${id} (صف ${last[id].row}): ${e.message}`);
    }
  }
  Logger.log(`انتهى. تم نسخ ${copied} صورة، وتخطي ${skipped} منسوخة سابقاً، وفشل ${failed.length}.`);
  if (failed.length) Logger.log('الفاشلة:\n' + failed.join('\n'));
  Logger.log('المجلد: ' + folder.getUrl());
}

const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '_');
