// بطاقات الأيتام: بيانات مختصرة + QR يفتح السجل
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET } = window.APP_CONFIG;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => (d ? d.split('-').reverse().join('/') : '—');
  const ids = (new URLSearchParams(location.search).get('ids') || '').split(',').filter(x => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);

  async function load() {
    if (!ids.length) { $('#info').textContent = 'لم تُحدَّد سجلات.'; return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return (location.href = 'index.html');
    const { data, error } = await sb.from('orphans').select('id, full_name, orphan_code, birth_date, photo_path').in('id', ids);
    if (error) { $('#info').textContent = 'تعذّر التحميل: ' + error.message; return; }
    const order = new Map(ids.map((id, i) => [id, i]));
    data.sort((a, b) => order.get(a.id) - order.get(b.id));

    const paths = data.map(o => o.photo_path).filter(Boolean);
    const urls = {};
    if (paths.length) {
      const { data: signed } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
      (signed || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl; });
    }

    $('#sheet').innerHTML = data.map(o => `
      <article class="idc">
        <div class="head"><b>THIRD PILLAR</b><span>مؤسسة الركيزة الثالثة</span></div>
        <div class="body">
          <div class="photo">${urls[o.photo_path] ? `<img src="${urls[o.photo_path]}" alt="">` : '<svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="4.5"/><path d="M3 22c0-5 4-8.5 9-8.5s9 3.5 9 8.5z"/></svg>'}</div>
          <div class="info">
            <div class="name">${esc(o.full_name)}</div>
            <div class="row"><span>رقم الهوية</span><b dir="ltr" style="text-align:start">${esc(o.orphan_code || '—')}</b></div>
            <div class="row"><span>تاريخ الميلاد</span><b>${fmt(o.birth_date)}</b></div>
          </div>
        </div>
        <div class="qr">${window.qrSvg(window.recordUrl(o.id))}</div>
        <div class="foot">returning favours bestowed upon us</div>
      </article>`).join('');

    // انتظار تحميل الصور والخط قبل الطباعة
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => (i.complete ? 1 : new Promise(r => (i.onload = i.onerror = r)))));
    $('#info').textContent = `${data.length} بطاقة (10 في الصفحة)` + (data.length < ids.length ? ` — ${ids.length - data.length} سجل لا تملك صلاحية عليه` : '');
    $('#printBtn').disabled = false;
  }

  $('#printBtn').onclick = () => window.print();
  load();
})();
