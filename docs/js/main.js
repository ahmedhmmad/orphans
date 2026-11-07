(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('#view');
  const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-GB') : '');
  const ROLE_AR = { admin: 'مشرف', registrar: 'مسجِّل' };
  let me = null;

  /* ============================== أدوات ============================== */
  let toastTimer;
  function toast(text, kind = '') {
    const t = $('#toast');
    t.textContent = text;
    t.className = 'toast ' + kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3800);
  }

  function printRecord(id) {
    $$('.print-frame').forEach(f => f.remove());
    const f = document.createElement('iframe');
    f.className = 'print-frame';
    f.src = `paper.html?id=${encodeURIComponent(id)}&print=1`;
    document.body.appendChild(f);
  }
  window.addEventListener('message', e => {
    if (e.origin === location.origin && e.data?.type === 'orphan-printed') $$('.print-frame').forEach(f => f.remove());
  });

  async function resizeImage(file, max = 900) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    } finally { URL.revokeObjectURL(url); }
  }

  /* ============================== الدخول ============================== */
  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return showLogin();
      await enter(session.user);
    } catch (e) {
      console.error(e);
      showLogin('تعذّر الاتصال بالخادم');
    }
  }

  function showLogin(msg = '') {
    $('#boot').hidden = true;
    $('#app').hidden = true;
    $('#loginView').hidden = false;
    $('#loginMsg').textContent = msg;
  }

  async function enter(user) {
    const { data: prof, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.error(error); await sb.auth.signOut(); return showLogin('تعذّر قراءة بيانات الحساب. تأكد من تشغيل ملف migration_v2.sql'); }
    if (!prof || !prof.active) {
      await sb.auth.signOut();
      return showLogin('هذا الحساب غير مفعّل في النظام. تواصل مع المشرف.');
    }
    me = { ...prof, email: user.email };
    $('#boot').hidden = true;
    $('#loginView').hidden = true;
    $('#app').hidden = false;
    $('#meName').textContent = me.full_name || me.email;
    $('#meRole').textContent = ROLE_AR[me.role];
    $$('[data-admin]').forEach(a => (a.hidden = me.role !== 'admin'));
    route();
  }

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('button');
    $('#loginMsg').textContent = '';
    btn.disabled = true;
    let id = f.email.value.trim();
    if (!id.includes('@')) {
      const { data: em } = await sb.rpc('email_for_username', { u: id });
      id = em || '';
    }
    const { data, error } = id ? await sb.auth.signInWithPassword({ email: id, password: f.password.value }) : { error: true };
    btn.disabled = false;
    if (error) return ($('#loginMsg').textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة');
    f.reset();
    await enter(data.user);
  });

  const pwDlg = $('#pwDialog');
  $('#pwBtn').addEventListener('click', () => { $('#pwForm').reset(); $('#pwMsg').textContent = ''; pwDlg.showModal(); });
  $('#pwCancel').addEventListener('click', () => pwDlg.close());
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, m = $('#pwMsg'), btn = f.querySelector('[type=submit]');
    m.className = 'msg err'; m.textContent = '';
    if (f.new1.value.length < 8) return (m.textContent = 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
    if (f.new1.value !== f.new2.value) return (m.textContent = 'تأكيد كلمة المرور غير مطابق');
    if (f.new1.value === f.cur.value) return (m.textContent = 'كلمة المرور الجديدة مطابقة للحالية');
    btn.disabled = true;
    const { error: e1 } = await sb.auth.signInWithPassword({ email: me.email, password: f.cur.value });
    if (e1) { btn.disabled = false; return (m.textContent = 'كلمة المرور الحالية غير صحيحة'); }
    const { error: e2 } = await sb.auth.updateUser({ password: f.new1.value });
    btn.disabled = false;
    if (e2) return (m.textContent = 'تعذّر التغيير: ' + e2.message);
    pwDlg.close();
    toast('تم تغيير كلمة المرور', 'ok');
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    me = null;
    view.innerHTML = '';
    location.hash = '#/';
    showLogin();
  });

  /* ============================== التوجيه ============================== */
  const ROUTES = { home: homeView, register: registerView, records: recordsView, users: usersView, photos: photosView };

  function route() {
    if (!me) return;
    const [path, qs] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
    let name = path || 'home';
    if (!ROUTES[name] || ((name === 'users' || name === 'photos') && me.role !== 'admin')) name = 'home';
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    window.scrollTo(0, 0);
    ROUTES[name](new URLSearchParams(qs || ''));
  }
  window.addEventListener('hashchange', route);

  /* ============================== الرئيسية ============================== */
  async function homeView() {
    view.innerHTML = `<div class="page-head"><div><h2>مرحباً، ${esc(me.full_name || '')}</h2><p>${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div></div><p class="empty">جارِ التحميل…</p>`;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const month = new Date(today.getFullYear(), today.getMonth(), 1);
    const count = from => {
      let q = sb.from('orphans').select('id', { count: 'exact', head: true });
      return from ? q.gte('created_at', from.toISOString()) : q;
    };
    const admin = me.role === 'admin';
    const [t, m, all, recent, todayRows, profs] = await Promise.all([
      count(today), count(month), count(null),
      sb.from('orphans').select('id, orphan_code, full_name, created_at').order('created_at', { ascending: false }).limit(8),
      admin ? sb.from('orphans').select('created_by').gte('created_at', today.toISOString()) : Promise.resolve({ data: [] }),
      admin ? sb.from('profiles').select('id, full_name') : Promise.resolve({ data: [] }),
    ]);
    if (t.error) return (view.innerHTML = `<p class="msg err">تعذّر تحميل البيانات: ${esc(t.error.message)}</p>`);

    const names = Object.fromEntries((profs.data || []).map(p => [p.id, p.full_name]));
    const byUser = {};
    (todayRows.data || []).forEach(r => { const n = names[r.created_by] || 'غير محدد'; byUser[n] = (byUser[n] || 0) + 1; });

    const rows = (recent.data || []).map(r => `
      <tr><td>${esc(r.orphan_code)}</td><td><b>${esc(r.full_name)}</b></td><td>${fmtDate(r.created_at)}</td>
      <td class="act"><button class="btn link" data-print="${r.id}">طباعة</button><a class="btn link" href="#/register?id=${r.id}">تعديل</a></td></tr>`).join('');

    view.innerHTML = `
      <div class="page-head"><div><h2>مرحباً، ${esc(me.full_name || '')}</h2><p>${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div></div>
      <div class="stats">
        <div class="stat hero"><div class="lbl">المسجَّلون اليوم</div><div class="num">${t.count ?? 0}</div><div class="hint">${admin ? 'إجمالي كل المسجِّلين' : 'من تسجيلاتك أنت'}</div></div>
        <div class="stat"><div class="lbl">هذا الشهر</div><div class="num">${m.count ?? 0}</div></div>
        <div class="stat"><div class="lbl">الإجمالي</div><div class="num">${all.count ?? 0}</div></div>
      </div>
      <div class="cta"><a class="btn lg" href="#/register">+ تسجيل يتيم جديد</a><a class="btn ghost lg" href="#/records">عرض السجلات</a></div>
      <div class="cols ${admin ? 'two' : ''}">
        <div class="card"><h3>آخر التسجيلات</h3>
          ${rows ? `<div class="table-wrap"><table class="list"><thead><tr><th>رقم الهوية</th><th>الاسم</th><th>التاريخ</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">لا توجد تسجيلات بعد.</p>'}
        </div>
        ${admin ? `<div class="card"><h3>تسجيلات اليوم حسب المسجِّل</h3>
          ${Object.keys(byUser).length ? `<ul class="by-user">${Object.entries(byUser).map(([n, c]) => `<li><span>${esc(n)}</span><b>${c}</b></li>`).join('')}</ul>` : '<p class="empty">لا توجد تسجيلات اليوم.</p>'}
        </div>` : ''}
      </div>`;
    view.onclick = e => { const b = e.target.closest('[data-print]'); if (b) printRecord(b.dataset.print); };
  }

  /* ============================== نموذج التسجيل ============================== */
  const GENDER = [['male', 'ذكر', 'Male'], ['female', 'أنثى', 'Female']];
  const YN = [['true', 'نعم', 'Yes'], ['false', 'لا', 'No']];
  const MSTATUS = [['alive', 'على قيد الحياة', 'Alive'], ['deceased', 'متوفاة', 'Deceased']];
  const HOUSING = [['owned', 'ملك / Owned'], ['rented', 'إيجار / Rented'], ['temporary', 'مؤقت / Temporary'], ['shared', 'مشترك / Shared'], ['sponsored', 'مكفول / Sponsored']];
  const RELATIONS = ['أخ شقيق', 'أخت شقيقة', 'أخ غير شقيق', 'أخت غير شقيقة'];
  const F = (name, ar, en, o = {}) => ({ name, ar, en, ...o });
  const H = text => ({ heading: text });

  const SECTIONS = [
    { n: 1, ar: 'البيانات الشخصية لليتيم', en: 'Orphan Personal Information', photo: true, fields: [
      F('full_name', 'الاسم الكامل', 'Full Name', { req: 1 }),
      F('orphan_code', 'رقم الهوية (لليتيم)', 'ID Number'),
      F('gender', 'الجنس', 'Gender', { type: 'radio', options: GENDER, req: 1 }),
      F('birth_date', 'تاريخ الميلاد', 'Date of Birth', { type: 'date', req: 1 }),
      F('age', 'العمر', 'Age', { type: 'number', int: 1, min: 0, max: 30, req: 1 }),
      F('nationality', 'الجنسية', 'Nationality', { req: 1 }),
      F('mobile', 'رقم الهاتف', 'Mobile Number', { type: 'tel', phone: 1, req: 1 }),
      F('arrival_date', 'تاريخ الوصول إلى مصر', 'Date of Arrival in Egypt', { type: 'date' }),
      F('sponsorship_start', 'تاريخ بدء الكفالة', 'Sponsorship Start Date', { type: 'date' }),
      F('sponsorship_end', 'تاريخ انتهاء الكفالة', 'Sponsorship End Date', { type: 'date' }),
      F('address', 'عنوان السكن الحالي', 'Current Address', { type: 'textarea', span: 1, req: 1 }),
    ] },
    { n: 2, fam: 1, ar: 'بيانات الأب', en: "Father's Information", fields: [
      F('father_name', 'اسم الأب', "Father's Name", { req: 1 }),
      F('father_birth_date', 'تاريخ الميلاد', 'Date of Birth', { type: 'date' }),
      F('father_death_date', 'تاريخ الوفاة', 'Date of Death', { type: 'date', req: 1 }),
      F('father_death_cause', 'سبب الوفاة', 'Cause of Death', { req: 1 }),
      F('father_death_place', 'مكان الوفاة', 'Place of Death'),
    ] },
    { n: 3, fam: 1, ar: 'بيانات الأم', en: "Mother's Information", fields: [
      F('mother_name', 'اسم الأم', "Mother's Name", { req: 1 }),
      F('mother_status', 'الحالة', 'Status', { type: 'radio', options: MSTATUS, req: 1 }),
      F('mother_birth_date', 'تاريخ الميلاد', 'Date of Birth', { type: 'date' }),
      F('mother_occupation', 'المهنة', 'Occupation'),
      F('mother_phone', 'رقم الهاتف', 'Mobile Number', { type: 'tel', phone: 1 }),
      F('mother_death_date', 'تاريخ الوفاة', 'Date of Death', { type: 'date', showIf: ['mother_status', 'deceased'] }),
      F('mother_death_cause', 'سبب الوفاة', 'Cause of Death', { showIf: ['mother_status', 'deceased'] }),
    ] },
    { n: 4, fam: 1, ar: 'بيانات الإخوة والأخوات', en: 'Siblings Information', siblings: true, fields: [] },
    { n: 5, ar: 'الحالة الصحية', en: 'Health Status', fields: [
      F('has_illness', 'هل يعاني اليتيم من مرض أو إعاقة؟', 'Does the orphan suffer from an illness or disability?', { type: 'radio', options: YN, bool: 1, req: 1, span: 1 }),
      F('illness_details', 'نوع المرض أو الإصابة وتفاصيلها', 'Type of Illness or Injury & Details', { type: 'textarea', span: 1, showIf: ['has_illness', 'true'] }),
      F('war_injury', 'هل الإصابة ناتجة عن الحرب؟', 'Is the injury a result of the war?', { type: 'radio', options: YN, bool: 1, showIf: ['has_illness', 'true'] }),
      F('needs_treatment', 'هل يحتاج إلى علاج مستمر؟', 'Does the orphan need continuous treatment?', { type: 'radio', options: YN, bool: 1, showIf: ['has_illness', 'true'] }),
      F('treatment_cost', 'المصروف الشهري للعلاج والأدوية (جنيه مصري)', 'Monthly Cost of Treatment & Medication (EGP)', { type: 'number', showIf: ['has_illness', 'true'] }),
    ] },
    { n: 6, fam: 1, ar: 'بيانات السكن', en: 'Housing Information', fields: [
      F('housing_type', 'نوع السكن', 'Type of Housing', { type: 'select', options: HOUSING, req: 1 }),
      F('household_members', 'عدد أفراد الأسرة المقيمين في السكن', 'Number of Family Members Living in the Residence', { type: 'number', int: 1, req: 1 }),
      F('housing_address', 'عنوان السكن بالتفصيل', 'Full Address of Residence', { type: 'textarea', span: 1, req: 1 }),
      F('monthly_rent', 'قيمة الإيجار الشهري (جنيه مصري)', 'Monthly Rent Amount (EGP)', { type: 'number' }),
    ] },
    { n: 7, fam: 1, ar: 'الوضع المالي والمعيشي للأسرة', en: 'Family Financial & Living Situation', fields: [
      F('orphans_count', 'عدد الأيتام', 'Number of Orphans', { type: 'number', int: 1, req: 1 }),
      F('family_members', 'عدد أفراد الأسرة', 'Total Number of Family Members', { type: 'number', int: 1, req: 1 }),
      F('guardian', 'اسم المعيل وصلة القرابة', 'Name of the Family Guardian & Relationship', { req: 1 }),
      F('income_source', 'مصدر دخل الأسرة', 'Family Source of Income', { req: 1 }),
      F('monthly_income', 'متوسط دخل الأسرة الشهري (جنيه مصري)', 'Average Monthly Family Income (EGP)', { type: 'number', req: 1 }),
      F('other_support', 'هل تتلقى الأسرة مساعدات من جهات أخرى؟', 'Does the family receive support from other organizations?', { type: 'radio', options: YN, bool: 1, req: 1 }),
      H('المصروفات الشهرية (جنيه مصري)'),
      F('exp_rent', 'الإيجار', 'Rent', { type: 'number', exp: 1 }),
      F('exp_food', 'الطعام والشراب', 'Food & Beverages', { type: 'number', exp: 1 }),
      F('exp_treatment', 'العلاج والأدوية', 'Treatment & Medication', { type: 'number', exp: 1 }),
      F('exp_education', 'التعليم والمواصلات', 'Education & Transportation', { type: 'number', exp: 1 }),
      F('exp_other', 'مصروفات أخرى', 'Other Expenses', { type: 'number', exp: 1 }),
      F('exp_total', 'الإجمالي', 'Total', { type: 'number', readonly: 1 }),
    ] },
  ];
  const ALL_FIELDS = SECTIONS.flatMap(s => s.fields).filter(f => f.name);
  // حقول العائلة المشتركة (تُحفظ في جدول families) + قائمة الإخوة غير المسجلين
  const FAMILY_NAMES = new Set([...SECTIONS.filter(x => x.fam).flatMap(x => x.fields).filter(x => x.name).map(x => x.name), 'siblings']);
  const split = all => {
    const orphan = {}, family = {};
    for (const [k, v] of Object.entries(all)) (FAMILY_NAMES.has(k) ? family : orphan)[k] = v;
    return { orphan, family };
  };
  const FAM_CARD = `<section class="sec" id="famSec"><div class="sec-h"><div class="sec-n">🔗</div><div><h3>ربط العائلة</h3><small>Family Link</small></div></div>
    <div class="sec-b"><div class="fld span2"><div id="famChip" class="banner"></div></div>
    <div class="fld span2"><label for="famQ">ابحث عن أخ أو أخت مسجَّل لربط العائلة (اسم اليتيم أو رقم الهوية أو اسم الأم أو المعيل)<small>Search</small></label>
      <input id="famQ" type="search" autocomplete="off" placeholder="اكتب 3 أحرف على الأقل…"><ul id="famRes" class="fam-res"></ul></div>
    <p class="note">عند الربط تُعبَّأ بيانات الأب والأم والسكن والمعيل والدخل والمصروفات من العائلة، وتكون <b>مشتركة</b>: أي تعديل عليها يظهر عند كل أيتام العائلة. الحالة الصحية تبقى خاصة بكل يتيم.</p></div></section>`;

  function fieldHTML(f) {
    if (f.heading) return `<h4 class="sub-h">${f.heading}</h4>`;
    const id = 'f_' + f.name;
    const t = f.type || 'text';
    let input;
    if (t === 'radio') {
      input = `<div class="seg" role="radiogroup">${f.options.map(([v, a, e]) =>
        `<label><input type="radio" name="${f.name}" value="${v}"><span>${a}<small>${e}</small></span></label>`).join('')}</div>`;
    } else if (t === 'select') {
      input = `<select id="${id}" name="${f.name}"><option value="">— اختر / Select —</option>${f.options.map(([v, tx]) => `<option value="${v}">${tx}</option>`).join('')}</select>`;
    } else if (t === 'textarea') {
      input = `<textarea id="${id}" name="${f.name}" rows="2"></textarea>`;
    } else {
      const extra = t === 'number' ? ` inputmode="${f.int ? 'numeric' : 'decimal'}" step="${f.int ? 1 : 'any'}" min="${f.min ?? 0}"${f.max != null ? ` max="${f.max}"` : ''}` :
        t === 'tel' ? ' dir="ltr" inputmode="tel"' : '';
      input = `<input id="${id}" name="${f.name}" type="${t}"${extra}${f.readonly ? ' readonly tabindex="-1"' : ''} autocomplete="off">`;
    }
    const span = t === 'textarea' || f.span ? ' span2' : '';
    return `<div class="fld${span}" data-name="${f.name}"${f.showIf ? ` data-showif="${f.showIf.join('=')}"` : ''}>
      <label for="${id}">${f.ar}${f.req ? '<i>*</i>' : ''}<small>${f.en}</small></label>${input}</div>`;
  }

  function siblingRowHTML(i, s = {}) {
    return `<div class="sib" data-i>
      <div class="no">${i}</div>
      <div><label>الاسم</label><input data-s="name" value="${esc(s.name)}"></div>
      <div><label>صلة القرابة</label><select data-s="relation"><option value=""></option>${RELATIONS.map(r => `<option ${s.relation === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div><label>تاريخ الميلاد</label><input type="date" data-s="birth_date" value="${esc(s.birth_date)}"></div>
      <div><label>تاريخ الوفاة (إن وجد)</label><input type="date" data-s="death_date" value="${esc(s.death_date)}"></div>
      <button type="button" class="rm" title="حذف" aria-label="حذف">×</button></div>`;
  }

  async function registerView(params) {
    const editId = params.get('id');
    view.innerHTML = `<div class="page-head"><div><h2>${editId ? 'تعديل بيانات يتيم' : 'تسجيل يتيم جديد'}</h2><p>الحقول المعلَّمة بـ <b style="color:var(--danger)">*</b> إلزامية</p></div></div>
      <div id="draftBanner" class="banner" hidden></div>
      <form id="regForm" class="reg" novalidate autocomplete="off">
        ${SECTIONS.map(s => `
          <section class="sec"><div class="sec-h"><div class="sec-n">${s.n}</div><div><h3>${s.ar}</h3><small>${s.en}</small></div>${s.fam ? '<span class="tag fam">مشتركة مع العائلة</span>' : ''}</div>
          <div class="sec-b">
            ${s.photo ? `<div class="photo-up"><div class="ph" id="phBox" title="اختيار صورة"><img id="phImg" alt="" hidden><svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="4.5"/><path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z"/></svg></div>
              <div class="tx"><button type="button" class="btn ghost sm" id="phBtn">اختيار / التقاط صورة اليتيم</button><small>أي مقاس، وتُصغَّر تلقائياً</small><input type="file" id="phInput" accept="image/*" hidden></div></div>` : ''}
            ${s.siblings ? `<div id="famMembers" class="members" hidden></div><div class="fld span2"><b>إخوة آخرون غير مسجَّلين في النظام:</b></div><div class="sibs" id="sibs"></div><div class="fld span2"><button type="button" class="btn ghost sm" id="addSib" style="align-self:flex-start">+ إضافة أخ / أخت</button></div>` : ''}
            ${s.fields.map(fieldHTML).join('')}
          </div></section>${s.n === 1 ? FAM_CARD : ''}`).join('')}
        <div class="savebar"><p id="regMsg" class="msg"></p><small id="draftNote"></small>
          <div class="btns"><a class="btn ghost" href="#/records">إلغاء</a>${editId ? '<button type="button" class="btn ghost" id="printEditBtn">🖨 طباعة</button>' : '<button type="button" class="btn ghost" id="draftBtn">💾 حفظ مؤقت</button>'}<button type="submit" class="btn lg" id="saveBtn">${editId ? 'حفظ التعديلات' : 'حفظ'}</button></div></div>
      </form>`;

    const form = $('#regForm');
    const msg = $('#regMsg');
    const setMsg = (t, k = '') => { msg.textContent = t; msg.className = 'msg ' + k; };
    let photoBlob = null;
    let existingPhoto = null;
    let record = null;
    let familyId = null;
    let members = [];

    // الإخوة
    const sibs = $('#sibs');
    const renumber = () => $$('.sib', sibs).forEach((r, i) => ($('.no', r).textContent = i + 1));
    const addSib = (s = {}) => {
      if ($$('.sib', sibs).length >= 20) return toast('الحد الأقصى 20 أخاً وأختاً');
      sibs.insertAdjacentHTML('beforeend', siblingRowHTML($$('.sib', sibs).length + 1, s));
    };
    $('#addSib').onclick = () => addSib();
    sibs.onclick = e => { if (e.target.closest('.rm')) { e.target.closest('.sib').remove(); renumber(); } };
    addSib();

    // الاعتماديات والحسابات
    function applyDeps() {
      $$('[data-showif]', form).forEach(d => {
        const [n, v] = d.dataset.showif.split('=');
        const show = form.elements[n]?.value === v;
        d.hidden = !show;
        $$('input, select, textarea', d).forEach(i => {
          i.disabled = !show;
          if (!show) i.type === 'radio' ? (i.checked = false) : (i.value = '');
        });
      });
    }
    const calcTotal = () => {
      const v = $$('[name^="exp_"]:not([name="exp_total"])', form).map(i => parseFloat(i.value)).filter(n => !isNaN(n));
      form.exp_total.value = v.length ? +v.reduce((a, b) => a + b, 0).toFixed(2) : '';
    };
    form.addEventListener('change', e => {
      applyDeps();
      if (e.target.name === 'birth_date' && e.target.value) {
        const b = new Date(e.target.value), n = new Date();
        let a = n.getFullYear() - b.getFullYear();
        if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
        if (a >= 0 && a <= 30) form.age.value = a;
      }
    });
    form.addEventListener('input', e => {
      if (e.target.name?.startsWith('exp_')) calcTotal();
      e.target.closest('.fld')?.classList.remove('invalid');
    });
    applyDeps();
    if (!editId) form.nationality.value = 'فلسطيني'; // افتراضي، قابل للتعديل

    // الصورة
    const showPhoto = src => { const i = $('#phImg'); i.src = src; i.hidden = false; $('#phBox svg').style.display = 'none'; };
    $('#phBtn').onclick = $('#phBox').onclick = () => $('#phInput').click();
    $('#phInput').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { photoBlob = await resizeImage(file); photoData = await blobToData(photoBlob); showPhoto(URL.createObjectURL(photoBlob)); queueDraft(); }
      catch { photoBlob = null; toast('تعذّر قراءة الصورة. استخدم JPG أو PNG', 'err'); }
    };

    // ===== ربط العائلة =====
    const famChip = $('#famChip'), famRes = $('#famRes'), famQ = $('#famQ'), famMembers = $('#famMembers');
    function renderFamily() {
      famChip.className = 'banner' + (familyId ? ' ok' : '');
      famChip.innerHTML = familyId
        ? `<span>🔗 مرتبط بعائلة${members.length ? ' — الأيتام: ' + members.map(m => esc(m.full_name)).join('، ') : ''}</span><button type="button" class="btn link red" id="unlinkFam">إلغاء الربط</button>`
        : '<span>عائلة جديدة — ابحث أدناه إن كان لليتيم أخ أو أخت مسجَّل في النظام لربطهما</span>';
      const others = members.filter(m => m.id !== editId);
      famMembers.hidden = !others.length;
      famMembers.innerHTML = others.length ? '<small>إخوة مسجَّلون في النظام (يظهرون تلقائياً في الاستمارة المطبوعة):</small>' + others.map(m => `<span class="chip">${esc(m.full_name)}</span>`).join('') : '';
      const u = $('#unlinkFam');
      if (u) u.onclick = () => { familyId = null; members = []; renderFamily(); queueDraft(); toast('أُلغي الربط: ستُحفظ البيانات الحالية كعائلة جديدة'); };
    }
    async function loadMembers() {
      if (!familyId) { members = []; return; }
      const { data } = await sb.rpc('family_members', { fid: familyId });
      members = data || [];
    }
    async function linkFamily(fid) {
      const { data, error } = await sb.rpc('get_family', { fid });
      const fam = Array.isArray(data) ? data[0] : data;
      if (error || !fam) return toast('تعذّر تحميل بيانات العائلة', 'err');
      familyId = fid;
      fill({ ...collect(), ...fam });
      await loadMembers();
      renderFamily();
      famRes.innerHTML = '';
      famQ.value = '';
      toast('تم ربط اليتيم بالعائلة وتعبئة بياناتها المشتركة', 'ok');
      queueDraft();
    }
    let searchTimer;
    famQ.oninput = () => {
      clearTimeout(searchTimer);
      const q = famQ.value.trim();
      if (q.length < 3) { famRes.innerHTML = q ? '<li class="hint">اكتب 3 أحرف على الأقل</li>' : ''; return; }
      searchTimer = setTimeout(async () => {
        const { data, error } = await sb.rpc('search_families', { q });
        if (error) { famRes.innerHTML = '<li class="hint">تعذّر البحث. تأكد من تشغيل migration_v5.sql</li>'; return; }
        const seen = new Set();
        const rows = (data || []).filter(r => (seen.has(r.family_id) ? false : seen.add(r.family_id)) && r.family_id !== familyId);
        famRes.innerHTML = rows.map(r => `<li data-fid="${r.family_id}"><b>${esc(r.orphan_name)}</b> <small>${esc(r.orphan_code || '')} — الأم: ${esc(r.mother_name || '—')} — المعيل: ${esc(r.guardian || '—')} — ${r.members} يتيم</small></li>`).join('') || '<li class="hint">لا توجد نتائج</li>';
      }, 350);
    };
    famRes.onclick = e => { const li = e.target.closest('[data-fid]'); if (li) linkFamily(li.dataset.fid); };
    renderFamily();

    if (editId) $('#printEditBtn').onclick = () => { printRecord(editId); toast('تُطبع النسخة المحفوظة. احفظ تعديلاتك أولاً لتظهر في الطباعة'); };

    // تحميل سجل للتعديل
    if (editId) {
      setMsg('جارِ تحميل السجل…');
      const { data, error } = await sb.from('orphans').select('*').eq('id', editId).single();
      if (error || !data) { setMsg('تعذّر العثور على السجل', 'err'); $('#saveBtn').disabled = true; }
      else {
        record = data;
        let fam = {};
        if (data.family_id) {
          const { data: fr } = await sb.from('families').select('*').eq('id', data.family_id).maybeSingle();
          if (fr) { fam = fr; familyId = fr.id; }
        }
        fill({ ...data, ...fam });
        await loadMembers();
        renderFamily();
        setMsg('');
        if (data.photo_path) {
          existingPhoto = data.photo_path;
          const { data: s } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(data.photo_path, 3600);
          if (s?.signedUrl) showPhoto(s.signedUrl);
        }
      }
    }

    function fill(rec) {
      ALL_FIELDS.forEach(f => {
        const v = rec[f.name];
        if ((f.type || 'text') === 'radio') {
          $$(`[name="${f.name}"]`, form).forEach(r => (r.checked = v !== null && v !== undefined && String(v) === r.value));
        } else form.elements[f.name].value = v ?? '';
      });
      sibs.innerHTML = '';
      const list = (rec.siblings || []).slice(0, 20);
      (list.length ? list : [{}]).forEach(s => addSib(s));
      applyDeps();
      calcTotal();
    }

    function collect() {
      const d = {};
      ALL_FIELDS.forEach(f => {
        const t = f.type || 'text';
        const el = form.elements[f.name];
        let v;
        if (t === 'radio') v = el.value === '' ? null : el.value;
        else { v = el.disabled ? '' : el.value.trim(); v = v === '' ? null : v; }
        if (v !== null && f.bool) v = v === 'true';
        else if (v !== null && t === 'number') v = Number(v);
        d[f.name] = v;
      });
      d.siblings = $$('.sib', sibs).map(r => ({
        name: $('[data-s=name]', r).value.trim(), relation: $('[data-s=relation]', r).value,
        birth_date: $('[data-s=birth_date]', r).value || null, death_date: $('[data-s=death_date]', r).value || null,
      })).filter(s => s.name || s.relation || s.birth_date || s.death_date);
      return d;
    }

    function validate() {
      $$('.fld.invalid', form).forEach(x => x.classList.remove('invalid'));
      let first = null;
      ALL_FIELDS.forEach(f => {
        const el = form.elements[f.name];
        const wrap = $(`.fld[data-name="${f.name}"]`, form);
        if (!wrap || wrap.hidden) return;
        const t = f.type || 'text';
        const val = t === 'radio' ? el.value : el.value.trim();
        let bad = f.req && !val;
        if (!bad && val && f.phone && !/^\+?[0-9 ]{8,16}$/.test(val)) bad = true;
        if (!bad && val && t === 'number' && (isNaN(Number(val)) || Number(val) < (f.min ?? 0) || (f.max != null && Number(val) > f.max))) bad = true;
        if (bad) { wrap.classList.add('invalid'); first ??= wrap; }
      });
      // الإخوة: إن كُتب الاسم فصلة القرابة إلزامية
      $$('.sib', sibs).forEach(r => {
        const rel = $('[data-s=relation]', r);
        rel.classList.remove('bad');
        if ($('[data-s=name]', r).value.trim() && !rel.value) { rel.classList.add('bad'); first ??= r; }
      });
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setMsg('برجاء استكمال الحقول المحددة باللون الأحمر', 'err');
        return false;
      }
      return true;
    }

    // ===== المسودة: حفظ مؤقت في هذا المتصفح أثناء الإدخال =====
    const DKEY = 'tp_draft_' + me.id;
    let photoData = null;
    let dt;
    const blobToData = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    const hasContent = d => !!photoData || d.siblings.length > 0 ||
      Object.entries(d).some(([k, v]) => k === 'siblings' ? false : k === 'nationality' ? (v && v !== 'فلسطيني') : (v !== null && v !== ''));
    function clearDraft() { clearTimeout(dt); try { localStorage.removeItem(DKEY); } catch { /* ignore */ } }
    function saveDraft(manual) {
      if (editId) return;
      const d = collect();
      if (!hasContent(d)) { if (manual) toast('لا توجد بيانات لحفظها بعد'); return; }
      try {
        localStorage.setItem(DKEY, JSON.stringify({ d, photo: photoData, t: Date.now(), fam: familyId }));
        $('#draftNote').textContent = 'حُفظت مسودة ' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        if (manual) toast('تم حفظ المسودة مؤقتاً', 'ok');
      } catch { if (manual) toast('تعذّر حفظ المسودة', 'err'); }
    }
    const queueDraft = () => { clearTimeout(dt); dt = setTimeout(() => saveDraft(false), 800); };
    if (!editId) {
      form.addEventListener('input', queueDraft);
      form.addEventListener('change', queueDraft);
      form.addEventListener('click', e => { if (e.target.closest('#addSib, .rm')) queueDraft(); });
      $('#draftBtn').onclick = () => saveDraft(true);
      try {
        const raw = localStorage.getItem(DKEY);
        if (raw) {
          const { d, photo, t, fam } = JSON.parse(raw);
          fill(d);
          if (fam) { familyId = fam; loadMembers().then(renderFamily); }
          if (photo) fetch(photo).then(r => r.blob()).then(b => { photoData = photo; photoBlob = b; showPhoto(photo); });
          const bn = $('#draftBanner');
          bn.hidden = false;
          bn.innerHTML = `<span>تم استرجاع مسودة محفوظة (${new Date(t).toLocaleString('ar-EG')})</span><button type="button" class="btn link red" id="clrDraft">مسح المسودة وبدء نموذج جديد</button>`;
          $('#clrDraft').onclick = () => { clearDraft(); route(); };
        }
      } catch { /* ignore */ }
    }

    form.onsubmit = async e => {
      e.preventDefault();
      if (!validate()) return;
      const btn = $('#saveBtn');
      btn.disabled = true;
      setMsg('جارِ الحفظ…');
      try {
        const { orphan: data, family } = split(collect());
        const wasLinked = !!familyId;
        let fid = familyId;
        if (!wasLinked) {
          fid = crypto.randomUUID();
          const { error: fe } = await sb.from('families').insert({ ...family, id: fid });
          if (fe) throw fe;
        }
        data.family_id = fid;
        const id = editId || crypto.randomUUID();
        if (photoBlob) {
          const path = `${id}.jpg`;
          const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, photoBlob, { contentType: 'image/jpeg', upsert: !!editId && !!existingPhoto });
          if (error) throw error;
          data.photo_path = path;
        }
        if (editId) {
          const { error } = await sb.from('orphans').update(data).eq('id', editId);
          if (error) throw error;
        } else {
          data.id = id;
          const { error } = await sb.from('orphans').insert(data);
          if (error) throw error;
        }
        if (wasLinked) {
          const { error: fe2 } = await sb.from('families').update(family).eq('id', fid);
          if (fe2) throw fe2;
        }
        clearDraft();
        showSuccess(id, data.full_name, !!editId);
      } catch (err) {
        console.error(err);
        setMsg(err?.code === '23505' ? 'رقم الهوية مسجّل من قبل' : 'تعذّر الحفظ: ' + (err?.message || err), 'err');
        btn.disabled = false;
      }
    };
  }

  function showSuccess(id, name, edited) {
    view.innerHTML = `<div class="card success"><div class="ic">✔</div>
      <h2>${edited ? 'تم حفظ التعديلات' : 'تم تسجيل البيانات بنجاح'}</h2>
      <p>${esc(name)}</p>
      <div class="cta"><button class="btn" id="rePrint">🖨 طباعة الاستمارة</button><a class="btn ghost" href="#/register" id="again">تسجيل يتيم آخر</a><a class="btn ghost" href="#/records">عرض السجلات</a></div></div>`;
    $('#rePrint').onclick = () => printRecord(id);
    $('#again').onclick = () => { if (location.hash === '#/register') route(); };
  }

  /* ============================== السجلات ============================== */
  async function recordsView() {
    const admin = me.role === 'admin';
    view.innerHTML = `<div class="page-head"><div><h2>السجلات</h2><p>${admin ? 'كل الأيتام المسجَّلين' : 'السجلات التي أدخلتها أنت'}</p></div>
      <div class="cta" style="margin:0"><a class="btn" href="#/register">+ تسجيل جديد</a>${admin ? '<button class="btn ghost" id="exportBtn">تصدير Excel (CSV)</button>' : ''}</div></div>
      <div class="toolbar"><input id="search" type="search" placeholder="بحث بالاسم أو رقم الهوية أو اسم الأم أو الهاتف…"><span class="count" id="count"></span></div>
      <div class="card" style="padding:0"><div class="table-wrap"><table class="list"><thead><tr>
        <th>رقم الهوية</th><th>الاسم الكامل</th><th>الجنس</th><th>العمر</th><th>اسم الأم</th><th>الهاتف</th><th>التسجيل</th>${admin ? '<th>المسجِّل</th>' : ''}<th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="9" class="empty">جارِ التحميل…</td></tr></tbody></table></div></div>`;

    const [recs, profs] = await Promise.all([
      sb.from('orphans').select('id, orphan_code, full_name, gender, age, mobile, created_at, created_by, family_id, family:families(mother_name, guardian)').order('created_at', { ascending: false }).limit(2000),
      admin ? sb.from('profiles').select('id, full_name') : Promise.resolve({ data: [] }),
    ]);
    if (recs.error) return ($('#rows').innerHTML = `<tr><td colspan="9" class="msg err">${esc(recs.error.message)}</td></tr>`);
    const names = Object.fromEntries((profs.data || []).map(p => [p.id, p.full_name]));
    const records = recs.data;

    const render = () => {
      const q = $('#search').value.trim().toLowerCase();
      const list = records.filter(r => !q || [r.full_name, r.orphan_code, r.family?.mother_name, r.family?.guardian, r.mobile].some(v => String(v ?? '').toLowerCase().includes(q)));
      $('#count').textContent = `${list.length} سجل`;
      $('#rows').innerHTML = list.length ? list.map(r => `<tr>
        <td>${esc(r.orphan_code)}</td><td><b>${esc(r.full_name)}</b></td>
        <td>${r.gender === 'male' ? 'ذكر' : r.gender === 'female' ? 'أنثى' : ''}</td><td>${esc(r.age)}</td>
        <td>${esc(r.family?.mother_name)}</td><td dir="ltr" style="text-align:end">${esc(r.mobile)}</td><td>${fmtDate(r.created_at)}</td>
        ${admin ? `<td>${esc(names[r.created_by] || '')}</td>` : ''}
        <td class="act"><button class="btn link" data-print="${r.id}">طباعة</button><a class="btn link" href="#/register?id=${r.id}">تعديل</a>${admin ? `<button class="btn link red" data-del="${r.id}">حذف</button>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="9" class="empty">لا توجد سجلات.</td></tr>`;
    };
    render();
    $('#search').oninput = render;

    view.onclick = async e => {
      const p = e.target.closest('[data-print]');
      if (p) return printRecord(p.dataset.print);
      const d = e.target.closest('[data-del]');
      if (d) {
        const r = records.find(x => x.id === d.dataset.del);
        if (!confirm(`حذف سجل "${r.full_name}" نهائياً؟ لا يمكن التراجع عن هذا.`)) return;
        const { data: row } = await sb.from('orphans').select('photo_path').eq('id', r.id).single();
        if (row?.photo_path) await sb.storage.from(PHOTO_BUCKET).remove([row.photo_path]);
        const { error } = await sb.from('orphans').delete().eq('id', r.id);
        if (error) return toast('تعذّر الحذف: ' + error.message, 'err');
        if (r.family_id) { // لا تبقى عائلة بلا أيتام
          const { count } = await sb.from('orphans').select('id', { count: 'exact', head: true }).eq('family_id', r.family_id);
          if (!count) await sb.from('families').delete().eq('id', r.family_id);
        }
        records.splice(records.indexOf(r), 1);
        render();
        toast('تم الحذف', 'ok');
      }
    };
    $('#exportBtn')?.addEventListener('click', exportCSV);
  }

  const HEADERS = {
    orphan_code: 'رقم الهوية', full_name: 'الاسم الكامل', gender: 'الجنس', age: 'العمر', nationality: 'الجنسية', birth_date: 'تاريخ الميلاد',
    mobile: 'الهاتف', arrival_date: 'تاريخ الوصول لمصر', address: 'العنوان الحالي', sponsorship_start: 'بدء الكفالة', sponsorship_end: 'انتهاء الكفالة',
    father_name: 'اسم الأب', father_birth_date: 'ميلاد الأب', father_death_date: 'وفاة الأب', father_death_cause: 'سبب وفاة الأب', father_death_place: 'مكان وفاة الأب',
    mother_name: 'اسم الأم', mother_birth_date: 'ميلاد الأم', mother_occupation: 'مهنة الأم', mother_phone: 'هاتف الأم', mother_status: 'حالة الأم',
    mother_death_date: 'وفاة الأم', mother_death_cause: 'سبب وفاة الأم', siblings: 'الإخوة', has_illness: 'مرض/إعاقة', illness_details: 'تفاصيل المرض',
    war_injury: 'إصابة حرب', needs_treatment: 'علاج مستمر', treatment_cost: 'تكلفة العلاج', housing_type: 'نوع السكن', housing_address: 'عنوان السكن',
    household_members: 'المقيمون في السكن', monthly_rent: 'الإيجار الشهري', orphans_count: 'عدد الأيتام', family_members: 'عدد أفراد الأسرة',
    guardian: 'المعيل', income_source: 'مصدر الدخل', monthly_income: 'متوسط الدخل', other_support: 'مساعدات أخرى', exp_rent: 'م. الإيجار',
    exp_food: 'م. الطعام', exp_treatment: 'م. العلاج', exp_education: 'م. التعليم والمواصلات', exp_other: 'م. أخرى', exp_total: 'إجمالي المصروفات', created_at: 'تاريخ التسجيل',
  };
  const LABELS = { male: 'ذكر', female: 'أنثى', alive: 'على قيد الحياة', deceased: 'متوفاة', owned: 'ملك', rented: 'إيجار', temporary: 'مؤقت', shared: 'مشترك', sponsored: 'مكفول' };
  const cell = v => {
    if (v === null || v === undefined) return '';
    if (v === true) v = 'نعم';
    else if (v === false) v = 'لا';
    else if (Array.isArray(v)) v = v.map(s => [s.name, s.relation, s.birth_date, s.death_date].filter(Boolean).join(' - ')).join(' | ');
    else v = LABELS[v] ?? v;
    return '"' + String(v).replace(/"/g, '""') + '"';
  };
  async function exportCSV() {
    const { data, error } = await sb.from('orphans').select('*, family:families(*)').order('created_at');
    if (error) return toast('تعذّر التصدير: ' + error.message, 'err');
    const keys = Object.keys(HEADERS);
    const csv = [keys.map(k => cell(HEADERS[k])).join(',')].concat(data.map(r => keys.map(k => cell({ ...r, ...(r.family || {}), created_at: r.created_at }[k])).join(','))).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `orphans-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ============================== رفع صور دفعة واحدة (للمشرف) ============================== */
  const normN = t => String(t || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x660).replace(/[_\-.()]+/g, ' ').replace(/\s+/g, ' ').trim();

  async function fetchAll(table, cols) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(cols).order('created_at').range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }

  async function photosView() {
    view.innerHTML = `<div class="page-head"><div><h2>رفع صور الأيتام</h2>
      <p>اختر عدة صور دفعة واحدة. تُطابَق مع السجلات باسم الملف: <b>رقم الهوية</b> (مثل 445813496.jpg) أو <b>اسم اليتيم</b>. راجع المطابقة قبل الرفع.</p></div></div>
      <div class="card"><div class="cta" style="margin:0 0 12px"><button class="btn" id="pickPh">اختيار الصور…</button>
        <label class="chk"><input type="checkbox" id="repl"> استبدال الصور الموجودة</label>
        <button class="btn ok" id="goUp" disabled>رفع المطابق</button></div>
        <p id="phMsg" class="msg"></p>
        <div class="table-wrap"><table class="list"><thead><tr><th></th><th>الصورة</th><th>اسم الملف</th><th>اليتيم المطابق</th><th>الحالة</th></tr></thead>
        <tbody id="phRows"><tr><td colspan="5" class="empty">لم تُختر صور بعد.</td></tr></tbody></table></div></div>
      <input type="file" id="phFiles" accept="image/*" multiple hidden>`;

    let orphans = [];
    try { orphans = await fetchAll('orphans', 'id, orphan_code, full_name, photo_path, created_at'); }
    catch (e) { return ($('#phMsg').textContent = 'تعذّر تحميل السجلات: ' + e.message); }
    const byCode = new Map(orphans.map(o => [normN(o.orphan_code).replace(/\s/g, ''), o]));
    const nameWords = orphans.map(o => ({ o, w: normN(o.full_name).split(' ') }));
    let items = [];

    const match = file => {
      const stem = file.name.replace(/\.[^.]+$/, '');
      const n = normN(stem);
      const digits = n.replace(/\s/g, '');
      if (/^\d{4,}$/.test(digits)) return { o: byCode.get(digits) || null, why: 'لا يوجد يتيم بهذا الرقم' };
      const exact = orphans.filter(o => normN(o.full_name) === n);
      if (exact.length === 1) return { o: exact[0] };
      const words = n.split(' ').filter(Boolean);
      if (words.length < 2) return { o: null, why: 'الاسم قصير، استخدم رقم الهوية' };
      const c = nameWords.filter(x => words.every(w => x.w.includes(w)));
      if (c.length === 1) return { o: c[0].o };
      return { o: null, why: c.length ? `يطابق ${c.length} أيتام` : 'لا يوجد يتيم بهذا الاسم' };
    };

    const render = () => {
      const repl = $('#repl').checked;
      const seen = new Set();
      items.forEach(it => {
        it.state = 'none';
        if (!it.o) { it.msg = it.why; return; }
        if (seen.has(it.o.id)) { it.msg = 'صورة أخرى لنفس اليتيم'; return; }
        seen.add(it.o.id);
        if (it.o.photo_path && !repl) { it.msg = 'لها صورة (تخطي)'; it.state = 'skip'; return; }
        it.state = 'ready'; it.msg = it.o.photo_path ? 'ستستبدل الصورة الحالية' : 'جاهزة';
      });
      $('#phRows').innerHTML = items.map((it, i) => `<tr>
        <td><input type="checkbox" data-i="${i}" ${it.state === 'ready' && it.on !== false ? 'checked' : ''} ${it.state !== 'ready' ? 'disabled' : ''}></td>
        <td><img class="th" src="${it.url}" alt=""></td><td dir="ltr" style="text-align:end">${esc(it.file.name)}</td>
        <td>${it.o ? `<b>${esc(it.o.full_name)}</b> <small>${esc(it.o.orphan_code || '')}</small>` : '—'}</td>
        <td><span class="tag ${it.state === 'ready' ? 'ok' : it.state === 'done' ? 'ok' : 'off'}">${esc(it.msg)}</span></td></tr>`).join('');
      const n = items.filter(i => i.state === 'ready' && i.on !== false).length;
      $('#goUp').disabled = !n;
      $('#goUp').textContent = n ? `رفع ${n} صورة` : 'رفع المطابق';
      $('#phMsg').textContent = items.length ? `${items.length} ملف: ${items.filter(i => i.state === 'ready').length} جاهز، ${items.filter(i => i.state === 'none').length} غير مطابق، ${items.filter(i => i.state === 'skip').length} متخطى` : '';
    };

    $('#pickPh').onclick = () => $('#phFiles').click();
    $('#phFiles').onchange = e => {
      items.forEach(i => URL.revokeObjectURL(i.url));
      items = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name)).map(file => ({ file, url: URL.createObjectURL(file), ...match(file) }));
      render();
    };
    $('#repl').onchange = render;
    $('#phRows').onchange = e => { const i = e.target.dataset?.i; if (i !== undefined) { items[i].on = e.target.checked; render(); } };

    $('#goUp').onclick = async () => {
      const todo = items.filter(i => i.state === 'ready' && i.on !== false);
      $('#goUp').disabled = $('#pickPh').disabled = true;
      let done = 0, failed = 0;
      const worker = async () => {
        while (todo.length) {
          const it = todo.shift();
          try {
            const blob = await resizeImage(it.file);
            const path = `${it.o.id}.jpg`;
            const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
            if (up.error) throw up.error;
            const u = await sb.from('orphans').update({ photo_path: path }).eq('id', it.o.id);
            if (u.error) throw u.error;
            it.o.photo_path = path; it.state = 'done'; it.msg = 'تم الرفع'; done++;
          } catch (err) { it.state = 'none'; it.msg = 'فشل: ' + (err.message || err); failed++; }
          $('#phMsg').textContent = `جارِ الرفع… ${done + failed}`;
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      $('#pickPh').disabled = false;
      render();
      $('#phMsg').textContent = `تم رفع ${done} صورة` + (failed ? ` — فشل ${failed}` : '');
      toast(`تم رفع ${done} صورة` + (failed ? `، وفشل ${failed}` : ''), failed ? 'err' : 'ok');
    };
  }

  /* ============================== المستخدمون ============================== */
  async function callUsers(body) {
    const { data, error } = await sb.functions.invoke('manage-users', { body });
    if (error) {
      let m = 'تعذّر الاتصال بدالة إدارة المستخدمين. تأكد من نشر الدالة manage-users (انظر README).';
      try { const j = await error.context.json(); if (j?.error) m = j.error; } catch { /* ignore */ }
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function usersView() {
    view.innerHTML = `<div class="page-head"><div><h2>المستخدمون</h2><p>إنشاء حسابات المسجِّلين وإدارتها</p></div></div>
      <div class="card" style="margin-bottom:18px"><h3>إضافة حساب جديد</h3>
        <form id="addUser" class="add-user" novalidate>
          <label>الاسم<input name="full_name" required></label>
          <label>اسم المستخدم<input name="username" dir="ltr" required autocomplete="off" placeholder="مثال: ahmed.ali"></label>
          <label>البريد الإلكتروني<input name="email" type="email" dir="ltr" required autocomplete="off"></label>
          <label>كلمة المرور (8 أحرف فأكثر)<input name="password" type="text" dir="ltr" required minlength="8" autocomplete="off"></label>
          <label>الصلاحية<select name="role"><option value="registrar">مسجِّل</option><option value="admin">مشرف</option></select></label>
          <button class="btn" type="submit">إنشاء الحساب</button>
        </form><p id="addMsg" class="msg" style="margin-top:8px"></p></div>
      <div class="card" style="padding:0"><div class="table-wrap"><table class="list"><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>البريد</th><th>الصلاحية</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead>
        <tbody id="urows"><tr><td colspan="7" class="empty">جارِ التحميل…</td></tr></tbody></table></div></div>`;

    let users = [];
    const load = async () => {
      try {
        users = (await callUsers({ action: 'list' })).users;
        $('#urows').innerHTML = users.map(u => `<tr>
          <td><b>${esc(u.full_name)}</b></td><td dir="ltr" style="text-align:end">${esc(u.username)}</td><td dir="ltr" style="text-align:end">${esc(u.email)}</td>
          <td><span class="tag">${ROLE_AR[u.role]}</span></td>
          <td><span class="tag ${u.active ? 'ok' : 'off'}">${u.active ? 'مفعّل' : 'معطّل'}</span></td>
          <td>${u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}</td>
          <td class="act">${u.id === me.id ? '<small>حسابك</small>' : `
            <button class="btn link" data-act="toggle" data-id="${u.id}">${u.active ? 'تعطيل' : 'تفعيل'}</button>
            <button class="btn link" data-act="uname" data-id="${u.id}">اسم المستخدم</button>
            <button class="btn link" data-act="pass" data-id="${u.id}">كلمة المرور</button>
            <button class="btn link red" data-act="del" data-id="${u.id}">حذف</button>`}</td></tr>`).join('');
      } catch (e) { $('#urows').innerHTML = `<tr><td colspan="7" class="msg err" style="padding:16px">${esc(e.message)}</td></tr>`; }
    };
    await load();

    $('#addUser').onsubmit = async e => {
      e.preventDefault();
      const f = e.target, m = $('#addMsg'), btn = f.querySelector('button');
      m.className = 'msg'; m.textContent = '';
      btn.disabled = true;
      try {
        await callUsers({ action: 'create', full_name: f.full_name.value, username: f.username.value, email: f.email.value, password: f.password.value, role: f.role.value });
        m.className = 'msg ok'; m.textContent = 'تم إنشاء الحساب. سلّم المسجِّل البريد وكلمة المرور.';
        f.reset();
        await load();
      } catch (err) { m.className = 'msg err'; m.textContent = err.message; }
      btn.disabled = false;
    };

    $('#urows').onclick = async e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const u = users.find(x => x.id === b.dataset.id);
      try {
        if (b.dataset.act === 'toggle') await callUsers({ action: 'update', id: u.id, active: !u.active });
        if (b.dataset.act === 'uname') {
          const n = prompt('اسم المستخدم الجديد (حروف إنجليزية وأرقام و . _ -):', u.username || '');
          if (!n) return;
          await callUsers({ action: 'update', id: u.id, username: n });
          toast('تم تغيير اسم المستخدم', 'ok');
        }
        if (b.dataset.act === 'pass') {
          const p = prompt(`كلمة مرور جديدة لـ ${u.full_name} (8 أحرف على الأقل):`);
          if (!p) return;
          await callUsers({ action: 'update', id: u.id, password: p });
          toast('تم تغيير كلمة المرور', 'ok');
        }
        if (b.dataset.act === 'del') {
          if (!confirm(`حذف حساب "${u.full_name}"؟ السجلات التي أدخلها تبقى محفوظة.`)) return;
          await callUsers({ action: 'delete', id: u.id });
          toast('تم حذف الحساب', 'ok');
        }
        await load();
      } catch (err) { toast(err.message, 'err'); }
    };
  }

  /* ============================== معاينة محلية للتصميم فقط ============================== */
  if (['localhost', '127.0.0.1'].includes(location.hostname) && location.hash === '#/_preview') {
    me = { id: 'preview', full_name: 'معاينة', role: 'admin', email: 'preview@local' };
    $('#boot').hidden = true; $('#app').hidden = false;
    $('#meName').textContent = 'معاينة'; $('#meRole').textContent = 'مشرف';
    location.hash = '#/register';
    route();
    return;
  }

  boot();
})();
