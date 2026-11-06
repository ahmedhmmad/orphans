(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('#orphanForm');
  const msg = $('#formMsg');
  const submitBtn = $('#submitBtn');
  const recordId = new URLSearchParams(location.search).get('id');
  let photoBlob = null;

  const RELATIONS = [
    ['', ''],
    ['أخ شقيق', 'أخ شقيق / Brother'],
    ['أخت شقيقة', 'أخت شقيقة / Sister'],
    ['أخ غير شقيق', 'أخ غير شقيق / Half-brother'],
    ['أخت غير شقيقة', 'أخت غير شقيقة / Half-sister'],
  ];

  // ---------- جدول الإخوة ----------
  const tbody = $('#siblingsBody');
  for (let i = 1; i <= 5; i++) {
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td class="no">${i}</td>
        <td><input name="sib_name_${i}" aria-label="اسم الأخ ${i}"></td>
        <td><select name="sib_relation_${i}" aria-label="صلة القرابة ${i}">
          ${RELATIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
        </select></td>
        <td><input type="date" name="sib_birth_date_${i}" aria-label="تاريخ ميلاد ${i}"></td>
        <td><input type="date" name="sib_death_date_${i}" aria-label="تاريخ وفاة ${i}"></td>
      </tr>`);
  }

  // ---------- منطق الحقول ----------
  function setGroupDisabled(selector, disabled) {
    $$(selector).forEach(el => {
      const box = el.closest('.field') || el;
      const inputs = el.matches('input, select, textarea') ? [el] : $$('input, select, textarea', el);
      inputs.forEach(i => { i.disabled = disabled; if (disabled) { i.type === 'radio' ? (i.checked = false) : (i.value = ''); } });
      box.classList.toggle('is-disabled', disabled);
    });
  }
  const motherState = () => setGroupDisabled('.mother-death', form.mother_status.value !== 'deceased');
  const illnessState = () => setGroupDisabled('.illness-dep', form.has_illness.value !== 'true');

  function calcTotal() {
    const vals = $$('.exp').map(i => parseFloat(i.value)).filter(n => !isNaN(n));
    form.exp_total.value = vals.length ? +vals.reduce((a, b) => a + b, 0).toFixed(2) : '';
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'mother_status') motherState();
    if (e.target.name === 'has_illness') illnessState();
  });
  form.addEventListener('input', e => {
    if (e.target.classList.contains('exp')) calcTotal();
    e.target.closest('.field, td')?.classList.remove('invalid');
  });
  motherState();
  illnessState();

  // ---------- الصورة: أي مقاس، تُصغَّر تلقائياً إلى 900px JPEG ----------
  $('#photoInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photoBlob = await resizeImage(file, 900);
      showPhoto(URL.createObjectURL(photoBlob));
    } catch {
      photoBlob = null;
      setMsg('تعذّر قراءة الصورة. استخدم صورة JPG أو PNG.', 'err');
    }
  });

  function showPhoto(src) {
    const img = $('#photoPreview');
    img.src = src;
    img.hidden = false;
  }

  async function resizeImage(file, max) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- جمع البيانات وتعبئتها ----------
  const parse = v => (v === 'true' ? true : v === 'false' ? false : v);

  function collect() {
    const data = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'file' || el.name.startsWith('sib_')) continue;
      if (el.type === 'radio') {
        if (el.checked && !el.disabled) data[el.name] = parse(el.value);
        else if (!(el.name in data)) data[el.name] = null;
        continue;
      }
      const v = el.disabled ? '' : el.value.trim();
      data[el.name] = v === '' ? null : el.type === 'number' ? Number(v) : v;
    }
    data.siblings = [];
    for (let i = 1; i <= 5; i++) {
      const s = {
        name: form[`sib_name_${i}`].value.trim(),
        relation: form[`sib_relation_${i}`].value,
        birth_date: form[`sib_birth_date_${i}`].value || null,
        death_date: form[`sib_death_date_${i}`].value || null,
      };
      if (s.name || s.relation || s.birth_date || s.death_date) data.siblings.push(s);
    }
    return data;
  }

  function fill(rec) {
    for (const el of form.elements) {
      if (!el.name || el.type === 'file' || el.name.startsWith('sib_') || !(el.name in rec)) continue;
      const v = rec[el.name];
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
    motherState();
    illnessState();
    // إعادة القيم بعد التفعيل (لأن التعطيل يمسحها)
    ['mother_death_date', 'mother_death_cause', 'illness_details', 'treatment_cost'].forEach(n => {
      if (!form[n].disabled) form[n].value = rec[n] ?? '';
    });
    ['war_injury', 'needs_treatment'].forEach(n => {
      $$(`[name="${n}"]`).forEach(r => { r.checked = !r.disabled && rec[n] !== null && String(rec[n]) === r.value; });
    });
    calcTotal();
  }

  // ---------- التحقق ----------
  function validate() {
    let first = null;
    $$('.invalid').forEach(x => x.classList.remove('invalid'));
    for (const el of form.elements) {
      if (!el.willValidate || el.checkValidity()) continue;
      (el.closest('.field, td') || el).classList.add('invalid');
      first ??= el;
    }
    if (first) {
      first.closest('.field, td').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setMsg('برجاء استكمال الحقول المحددة باللون الأحمر / Please complete the highlighted fields', 'err');
      return false;
    }
    return true;
  }

  function setMsg(text, kind = '') {
    msg.textContent = text;
    msg.className = 'msg ' + kind;
  }

  // ---------- الحفظ ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validate()) return;
    submitBtn.disabled = true;
    setMsg('جارِ الحفظ… / Saving…');
    try {
      const data = collect();
      const id = recordId || crypto.randomUUID();

      if (photoBlob) {
        const path = `${id}.jpg`;
        const { error } = await sb.storage.from(PHOTO_BUCKET)
          .upload(path, photoBlob, { contentType: 'image/jpeg', upsert: !!recordId });
        if (error) throw error;
        data.photo_path = path;
      }

      if (recordId) {
        const { error } = await sb.from('orphans').update(data).eq('id', recordId);
        if (error) throw error;
        setMsg('تم حفظ التعديلات ✔', 'ok');
      } else {
        data.id = id;
        const { error } = await sb.from('orphans').insert(data);
        if (error) throw error;
        $('#doneScreen').hidden = false;
      }
    } catch (err) {
      console.error(err);
      const text = err?.code === '23505'
        ? 'الرقم التعريفي لليتيم مسجّل من قبل / This Orphan ID already exists'
        : 'حدث خطأ أثناء الحفظ، حاول مرة أخرى / Error while saving: ' + (err?.message || err);
      setMsg(text, 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---------- الطباعة ----------
  const markEmpty = () => $$('input[type="date"], select').forEach(el => el.classList.toggle('is-empty', !el.value));
  window.addEventListener('beforeprint', markEmpty);
  form.addEventListener('change', markEmpty);
  markEmpty();
  $('#printBtn').addEventListener('click', () => { markEmpty(); window.print(); });

  // ---------- وضع المشرف: عرض/تعديل سجل ----------
  async function loadRecord() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      location.replace('admin.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return;
    }
    $('#adminBar').hidden = false;
    submitBtn.textContent = 'حفظ التعديلات';
    setMsg('جارِ التحميل…');
    const { data, error } = await sb.from('orphans').select('*').eq('id', recordId).single();
    if (error || !data) {
      setMsg('لم يتم العثور على السجل / Record not found', 'err');
      submitBtn.disabled = true;
      return;
    }
    fill(data);
    document.title = `${data.full_name} | استمارة يتيم`;
    $('#recordInfo').textContent = `${data.orphan_code || ''} — ${data.full_name}`;
    if (data.photo_path) {
      const { data: s } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(data.photo_path, 3600);
      if (s?.signedUrl) showPhoto(s.signedUrl);
    }
    setMsg('');
  }

  if (recordId) loadRecord();
})();
