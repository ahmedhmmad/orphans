(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let records = [];

  const next = new URLSearchParams(location.search).get('next');
  const safeNext = next && /^index\.html\?id=[\w-]+$/.test(next) ? next : null;

  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    if (safeNext) return location.replace(safeNext);
    showList();
  }

  function showLogin() {
    $('#loginView').hidden = false;
    $('#listView').hidden = true;
    $('#logoutBtn').hidden = true;
  }

  async function showList() {
    $('#loginView').hidden = true;
    $('#listView').hidden = false;
    $('#logoutBtn').hidden = false;
    $('#listMsg').textContent = 'جارِ التحميل…';
    const { data, error } = await sb.from('orphans')
      .select('id, orphan_code, full_name, gender, age, mother_name, mobile, created_at, photo_path')
      .order('created_at', { ascending: false });
    if (error) {
      $('#listMsg').textContent = 'تعذّر تحميل البيانات: ' + error.message;
      $('#listMsg').className = 'msg err';
      return;
    }
    records = data;
    render();
  }

  function render() {
    const q = $('#search').value.trim().toLowerCase();
    const rows = records.filter(r => !q || [r.full_name, r.orphan_code, r.mother_name, r.mobile]
      .some(v => String(v ?? '').toLowerCase().includes(q)));
    $('#count').textContent = `${rows.length} سجل`;
    $('#rows').innerHTML = rows.map(r => `
      <tr>
        <td>${esc(r.orphan_code)}</td>
        <td><b>${esc(r.full_name)}</b></td>
        <td>${r.gender === 'male' ? 'ذكر' : r.gender === 'female' ? 'أنثى' : ''}</td>
        <td>${esc(r.age)}</td>
        <td>${esc(r.mother_name)}</td>
        <td dir="ltr">${esc(r.mobile)}</td>
        <td>${new Date(r.created_at).toLocaleDateString('en-GB')}</td>
        <td class="actions-cell">
          <a class="link" href="index.html?id=${r.id}" target="_blank" rel="noopener">عرض / تعديل / طباعة</a>
          <button class="del" data-id="${r.id}">حذف</button>
        </td>
      </tr>`).join('');
    $('#listMsg').textContent = rows.length ? '' : 'لا توجد سجلات.';
    $('#listMsg').className = 'msg';
  }

  $('#search').addEventListener('input', render);

  $('#rows').addEventListener('click', async e => {
    const id = e.target.dataset?.id;
    if (!id) return;
    const r = records.find(x => x.id === id);
    if (!confirm(`حذف سجل "${r.full_name}" نهائياً؟ لا يمكن التراجع عن هذا.`)) return;
    if (r.photo_path) await sb.storage.from(PHOTO_BUCKET).remove([r.photo_path]);
    const { error } = await sb.from('orphans').delete().eq('id', id);
    if (error) return alert('تعذّر الحذف: ' + error.message);
    records = records.filter(x => x.id !== id);
    render();
  });

  // ---------- تصدير CSV (يفتح في Excel بالعربي) ----------
  const HEADERS = {
    orphan_code: 'الرقم التعريفي', full_name: 'الاسم الكامل', gender: 'الجنس', age: 'العمر',
    nationality: 'الجنسية', birth_date: 'تاريخ الميلاد', mobile: 'الهاتف', arrival_date: 'تاريخ الوصول لمصر',
    address: 'العنوان الحالي', sponsorship_start: 'بدء الكفالة', sponsorship_end: 'انتهاء الكفالة',
    father_name: 'اسم الأب', father_birth_date: 'ميلاد الأب', father_death_date: 'وفاة الأب',
    father_death_cause: 'سبب وفاة الأب', father_death_place: 'مكان وفاة الأب',
    mother_name: 'اسم الأم', mother_birth_date: 'ميلاد الأم', mother_occupation: 'مهنة الأم',
    mother_phone: 'هاتف الأم', mother_status: 'حالة الأم', mother_death_date: 'وفاة الأم', mother_death_cause: 'سبب وفاة الأم',
    siblings: 'الإخوة', has_illness: 'مرض/إعاقة', illness_details: 'تفاصيل المرض', war_injury: 'إصابة حرب',
    needs_treatment: 'علاج مستمر', treatment_cost: 'تكلفة العلاج الشهرية',
    housing_type: 'نوع السكن', housing_address: 'عنوان السكن', household_members: 'المقيمون في السكن', monthly_rent: 'الإيجار الشهري',
    orphans_count: 'عدد الأيتام', family_members: 'عدد أفراد الأسرة', guardian: 'المعيل', income_source: 'مصدر الدخل',
    monthly_income: 'متوسط الدخل الشهري', other_support: 'مساعدات أخرى',
    exp_rent: 'م. الإيجار', exp_food: 'م. الطعام', exp_treatment: 'م. العلاج', exp_education: 'م. التعليم والمواصلات',
    exp_other: 'م. أخرى', exp_total: 'إجمالي المصروفات', created_at: 'تاريخ التسجيل',
  };
  const LABELS = {
    male: 'ذكر', female: 'أنثى', alive: 'على قيد الحياة', deceased: 'متوفاة',
    owned: 'ملك', rented: 'إيجار', temporary: 'مؤقت', shared: 'مشترك',
  };
  const cell = v => {
    if (v === null || v === undefined) return '';
    if (v === true) v = 'نعم';
    else if (v === false) v = 'لا';
    else if (Array.isArray(v)) v = v.map(s => [s.name, s.relation, s.birth_date, s.death_date].filter(Boolean).join(' - ')).join(' | ');
    else v = LABELS[v] ?? v;
    return '"' + String(v).replace(/"/g, '""') + '"';
  };

  $('#exportBtn').addEventListener('click', async () => {
    const { data, error } = await sb.from('orphans').select('*').order('created_at');
    if (error) return alert('تعذّر التصدير: ' + error.message);
    const keys = Object.keys(HEADERS);
    const csv = [keys.map(k => cell(HEADERS[k])).join(',')]
      .concat(data.map(r => keys.map(k => cell(r[k])).join(',')))
      .join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `orphans-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ---------- الدخول والخروج ----------
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    $('#loginMsg').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) { $('#loginMsg').textContent = 'بيانات الدخول غير صحيحة'; return; }
    f.reset();
    if (safeNext) return location.replace(safeNext);
    showList();
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    records = [];
    $('#rows').innerHTML = '';
    showLogin();
  });

  init();
})();
