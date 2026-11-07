// صفحة الاستمارة الورقية (للعرض والطباعة فقط) — تُحمَّل ببيانات سجل واحد
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const autoPrint = params.get('print') === '1';
  const inFrame = window.parent !== window;
  const form = $('#orphanForm');

  const RELATIONS = ['', 'أخ شقيق', 'أخت شقيقة', 'أخ غير شقيق', 'أخت غير شقيقة'];
  const tbody = $('#siblingsBody');
  for (let i = 1; i <= 5; i++) {
    tbody.insertAdjacentHTML('beforeend', `
      <tr><td class="no">${i}</td>
      <td><input name="sib_name_${i}" readonly></td>
      <td><select name="sib_relation_${i}">${RELATIONS.map(r => `<option value="${r}">${r}</option>`).join('')}</select></td>
      <td><input type="date" name="sib_birth_date_${i}" readonly></td>
      <td><input type="date" name="sib_death_date_${i}" readonly></td></tr>`);
  }

  // كل الحقول للقراءة فقط
  $$('input:not([type=radio]):not([type=file]), textarea', form).forEach(el => (el.readOnly = true));
  if (inFrame) $('#paperBar').hidden = true;

  const markEmpty = () => $$('input[type="date"], select', form).forEach(el => el.classList.toggle('is-empty', !el.value));

  function fill(rec) {
    for (const el of form.elements) {
      const n = el.name;
      if (!n || el.type === 'file' || n.startsWith('sib_') || !(n in rec)) continue;
      const v = rec[n];
      if (el.type === 'radio') el.checked = v !== null && String(v) === el.value;
      else el.value = v ?? '';
    }
    (rec.siblings || []).slice(0, 5).forEach((s, idx) => {
      const i = idx + 1;
      form[`sib_name_${i}`].value = s.name || '';
      form[`sib_relation_${i}`].value = s.relation || '';
      form[`sib_birth_date_${i}`].value = s.birth_date || '';
      form[`sib_death_date_${i}`].value = s.death_date || '';
    });
    markEmpty();
    appendExtraSiblings(rec.siblings || []);
  }

  // أكثر من 5 إخوة: تبقى صفحتا الاستمارة كما هما، وتُضاف صفحة ملحق ثالثة بالباقي
  function appendExtraSiblings(all) {
    const extra = all.slice(5);
    if (!extra.length) return;
    const pages = $$('.page', form);
    const p2 = pages[1], p1 = pages[0];
    const page = document.createElement('section');
    page.className = 'page';
    page.appendChild($('.page-head', p2).cloneNode(true));
    const d = v => (v ? v.split('-').reverse().join('/') : '');
    const rows = extra.map((s, i) => `<tr><td class="no">${i + 6}</td><td class="v">${esc(s.name)}</td><td class="v">${esc(s.relation)}</td><td class="v">${d(s.birth_date)}</td><td class="v">${d(s.death_date)}</td></tr>`).join('');
    const sec = document.createElement('div');
    sec.className = 'sec';
    sec.innerHTML = `<div class="sec-head"><div class="sec-tab"><svg><use href="#i-people"/></svg><div><b>4. بيانات الإخوة والأخوات (تابع)</b><small>Siblings Information (continued)</small></div></div></div>
      <div class="panel"><div class="tbl-wrap"><table class="tbl siblings extra"><thead>${$('.siblings thead').innerHTML}</thead><tbody>${rows}</tbody></table></div></div>`;
    page.appendChild(sec);
    page.appendChild($('.page-foot', p1).cloneNode(true));
    p2.after(page);
    $$('.page-badge', form).forEach((b, i) => {
      $('b', b).textContent = `الصفحة ${i + 1} من 3`;
      $('small', b).textContent = `Page ${i + 1} of 3`;
    });
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const waitImage = img => new Promise(res => {
    if (img.complete && img.naturalWidth) return res();
    img.onload = img.onerror = () => res();
  });

  async function load() {
    if (!id) return document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">لا يوجد سجل محدد.</p>');
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (location.href = 'index.html');

    const { data, error } = await sb.from('orphans').select('*').eq('id', id).single();
    if (error || !data) return document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">تعذّر العثور على السجل.</p>');
    fill(data);
    document.title = `${data.full_name} | استمارة يتيم`;

    if (data.photo_path) {
      const { data: s } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(data.photo_path, 600);
      if (s?.signedUrl) {
        const img = $('#photoPreview');
        img.src = s.signedUrl;
        img.hidden = false;
        await waitImage(img);
      }
    }
    await document.fonts.ready;

    if (autoPrint) {
      window.addEventListener('afterprint', () => window.parent.postMessage({ type: 'orphan-printed' }, location.origin));
      setTimeout(() => { window.focus(); window.print(); }, 250);
    }
  }

  window.addEventListener('beforeprint', markEmpty);
  $('#printBtn').addEventListener('click', () => { markEmpty(); window.print(); });
  load();
})();
