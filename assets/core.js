/* الفكر السعد — shared helpers: API, formatting, UI primitives */
(function () {
  const CONFIG = {
    url: 'https://ffwjxvrporoittxrllru.supabase.co',
    key: 'sb_publishable_L3INZ93lx6-JQNPfFh55wA_NoeJ1XJr',
  };
  const LOCALE = 'ar-u-nu-latn';

  const ERRORS = {
    invalid_login: 'بيانات الدخول غير صحيحة',
    too_many_attempts: 'محاولات كثيرة، حاول مرة أخرى بعد قليل',
    unauthorized: 'انتهت الجلسة، الرجاء تسجيل الدخول مجدداً',
    location_required: 'يجب السماح بالوصول إلى موقعك لتسجيل البصمة',
    already_checked_in: 'تم تسجيل حضورك مسبقاً اليوم',
    already_checked_out: 'تم تسجيل انصرافك مسبقاً اليوم',
    not_checked_in: 'يجب تسجيل الحضور أولاً',
    missing_fields: 'الرجاء تعبئة الحقول المطلوبة',
    bad_pin: 'الرمز السري يجب أن يكون من 4 إلى 8 أرقام',
    duplicate_code: 'الرقم الوظيفي مستخدم لموظف آخر',
    weak_password: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    bad_timezone: 'المنطقة الزمنية غير صحيحة',
    network: 'تعذّر الاتصال بالخادم، تحقق من الإنترنت',
  };

  class ApiError extends Error {
    constructor(code) { super(code); this.code = code; }
  }

  function errorText(err) {
    const code = (err && (err.code || err.message)) || 'network';
    const m = /^outside_area:(\d+)/.exec(code);
    if (m) return `أنت خارج نطاق مقر العمل (تبعد ${Number(m[1]).toLocaleString(LOCALE)} م)`;
    return ERRORS[code] || 'حدث خطأ غير متوقع، حاول مرة أخرى';
  }

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${CONFIG.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CONFIG.key },
        body: JSON.stringify(args || {}),
      });
    } catch (e) {
      throw new ApiError('network');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) throw new ApiError((data && data.message) || 'network');
    return data;
  }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  /* ── formatting ── */
  function fmtTime(iso, tz) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  }
  function fmtDate(d, opts) {
    const date = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d);
    const o = Object.assign({ weekday: 'long', day: 'numeric', month: 'long' }, opts || {});
    if (typeof d === 'string' && d.length === 10) o.timeZone = 'UTC';
    return date.toLocaleDateString(LOCALE, o);
  }
  function fmtHijri(tz) {
    try {
      return new Date().toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
    } catch (e) { return ''; }
  }
  function fmtDuration(ms) {
    if (ms == null || ms < 0) return '—';
    const m = Math.floor(ms / 60000);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h === 0) return `${mm} د`;
    return `${h} س ${mm ? mm + ' د' : ''}`.trim();
  }
  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }
  function todayISO(tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '؟';
    const first = (w) => (w.length > 2 && w.startsWith('ال') ? w[2] : w[0]);
    return (first(parts[0]) + (parts[1] ? '\u200c' + first(parts[1]) : '')).toUpperCase();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const STATUS = {
    present: { label: 'في الوقت', cls: 'ok' },
    late: { label: 'متأخر', cls: 'warn' },
    absent: { label: 'غائب', cls: 'bad' },
    out: { label: 'انصرف', cls: 'info' },
  };
  function statusPill(status) {
    const s = STATUS[status] || { label: status, cls: 'mute' };
    return `<span class="pill ${s.cls}">${s.label}</span>`;
  }

  /* ── UI primitives ── */
  function toast(msg, type) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  function sheet(html, onMount, onClose) {
    const bd = document.createElement('div');
    bd.className = 'sheet-backdrop';
    const sh = document.createElement('div');
    sh.className = 'sheet';
    sh.setAttribute('role', 'dialog');
    sh.innerHTML = '<div class="grip"></div>' + html;
    document.body.append(bd, sh);
    document.body.style.overflow = 'hidden';
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (onClose) onClose();
      sh.classList.add('closing'); bd.classList.add('closing');
      document.body.style.overflow = '';
      setTimeout(() => { sh.remove(); bd.remove(); }, 250);
    };
    bd.addEventListener('click', close);
    sh.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    if (onMount) onMount(sh, close);
    return close;
  }

  function confirmSheet(title, text, okLabel) {
    return new Promise((resolve) => {
      let done = false;
      sheet(`<div class="confirm-box"><div class="ico">!</div><h3>${esc(title)}</h3>
        <p class="muted small">${esc(text)}</p></div>
        <div class="grid-2" style="margin-top:14px"><button class="btn ghost" data-close>إلغاء</button>
        <button class="btn danger" id="cfOk">${esc(okLabel || 'تأكيد')}</button></div>`,
      (el, close) => {
        el.querySelector('#cfOk').onclick = () => { done = true; close(); resolve(true); };
      }, () => { if (!done) resolve(false); });
    });
  }

  function busy(btn, on) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.label || btn.innerHTML; btn.disabled = false; }
  }

  function countUp(el, to, dur) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    const start = performance.now();
    const d = dur || 700;
    const step = (now) => {
      const p = Math.min(1, (now - start) / d);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString(LOCALE);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

  function distanceM(lat1, lng1, lat2, lng2) {
    const R = 6371000, toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
    finger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v3a8 8 0 0 1-1.5 4.7"/><path d="M8.5 7.5A5 5 0 0 1 17 11v2.5a12 12 0 0 1-.7 4"/><path d="M5.6 9.4A8 8 0 0 1 12 3a8 8 0 0 1 8 8v1"/><path d="M8.5 11a3.5 3.5 0 0 1 7 0v2a10 10 0 0 1-2 6"/><path d="M5 13.5a12 12 0 0 0 1 4.5"/><path d="M8.6 14.5a10 10 0 0 1-.2 5.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19.5 7"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  };

  window.Fikr = {
    CONFIG, LOCALE, rpc, errorText, store, fmtTime, fmtDate, fmtHijri, fmtDuration, fmtClock, todayISO, addDays,
    initials, esc, statusPill, STATUS, toast, sheet, confirmSheet, busy, countUp, vibrate, distanceM, ICONS,
  };
})();
