// تواريخ بصيغة يوم/شهر/سنة في كل مكان.
// حقول التاريخ الأصلية تتبع لغة المتصفح (شهر/يوم/سنة في الإنجليزية الأمريكية)، فنحوّلها إلى حقول نصية
// بقناع dd/mm/yyyy، ويبقى `.value` يُرجع/يقبل الصيغة القياسية yyyy-mm-dd فلا يتغير الكود الذي يستخدمها.
(() => {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const toDigits = s => String(s).replace(/[٠-٩]/g, d => AR.indexOf(d));
  const pad = n => String(n).padStart(2, '0');

  window.isoToDMY = iso => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  };
  window.dmyToIso = text => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text).trim());
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1900 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  };

  window.initDateInput = el => {
    if (el.dataset.date) return;
    el.dataset.date = '1';
    const initial = proto.get.call(el);
    el.type = 'text';
    el.inputMode = 'numeric';
    el.maxLength = 10;
    el.autocomplete = 'off';
    if (!document.body.classList.contains('paper')) el.placeholder = 'يوم/شهر/سنة';
    let iso = '';
    const show = t => proto.set.call(el, t);

    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => iso,
      set: v => {
        const s = String(v ?? '');
        iso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
        show(iso ? window.isoToDMY(iso) : '');
        el.dataset.bad = '';
        el.classList.remove('bad-date');
      },
    });

    el.addEventListener('input', () => {
      const digits = toDigits(proto.get.call(el)).replace(/\D/g, '').slice(0, 8);
      let out = digits;
      if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
      show(out);
      const parsed = out.length === 10 ? window.dmyToIso(out) : null;
      const prev = iso;
      iso = parsed || '';
      el.dataset.bad = out && !parsed ? '1' : '';
      el.classList.toggle('bad-date', out.length === 10 && !parsed);
      if (parsed && parsed !== prev) el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    el.value = initial;
  };

  window.initDates = (root = document) => root.querySelectorAll('input[type="date"]').forEach(window.initDateInput);
})();
