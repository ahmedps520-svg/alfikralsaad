/* الفكر السعد — admin dashboard */
(function () {
  const F = window.Fikr;
  const $ = (s, el) => (el || document).querySelector(s);
  const TOKEN_KEY = 'fikr.admin.token';
  const TIMEZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Baghdad', 'Asia/Amman', 'Africa/Cairo', 'Europe/Istanbul'];

  const state = {
    token: F.store.get(TOKEN_KEY), tab: 'today', tz: 'Asia/Riyadh', company: '',
    date: null, overview: null, filter: 'all', q: '',
    list: null, records: null, recFrom: null, recTo: null, recEmp: '', empQ: '', timer: null,
  };

  document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = F.ICONS[el.dataset.icon]; });

  /* ───────── auth ───────── */
  function showLogin() {
    $('#app').classList.add('hidden');
    $('#tabbar').classList.add('hidden');
    $('#login').classList.remove('hidden');
    setTimeout(() => $('#password').focus(), 400);
  }
  function showApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#tabbar').classList.remove('hidden');
    go(state.tab);
  }
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#loginBtn');
    F.busy(btn, true);
    try {
      const r = await F.rpc('alfikr_admin_login', { p_password: $('#password').value });
      state.token = r.token;
      F.store.set(TOKEN_KEY, r.token);
      $('#password').value = '';
      showApp();
    } catch (e) {
      const c = $('.auth-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
      F.toast(F.errorText(e), 'bad');
    } finally { F.busy(btn, false); }
  });
  function logout(expired) {
    if (state.token && !expired) F.rpc('alfikr_admin_logout', { p_token: state.token }).catch(() => {});
    F.store.del(TOKEN_KEY);
    state.token = null;
    clearInterval(state.timer);
    showLogin();
    if (expired) F.toast(F.errorText({ code: 'unauthorized' }));
  }
  async function call(fn, args) {
    try {
      return await F.rpc(fn, Object.assign({ p_token: state.token }, args || {}));
    } catch (e) {
      if (e.code === 'unauthorized') logout(true);
      throw e;
    }
  }

  /* ───────── navigation ───────── */
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { F.vibrate(8); go(t.dataset.tab); }));
  function go(tab) {
    state.tab = tab;
    clearInterval(state.timer);
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.fab').forEach((f) => f.remove());
    window.scrollTo({ top: 0 });
    ({ today: loadToday, employees: loadEmployees, records: loadRecords, settings: loadSettings })[tab]();
  }
  const view = (html) => { $('#view').innerHTML = html; };
  const hero = (title, sub, extra) => `
    <header class="hero compact"><div class="hero-top"><div><p class="sub">${sub}</p><h1>${title}</h1></div>
      <div class="row" style="gap:8px">${F.langSwitch('glass')}<button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button></div></div>${extra || ''}</header>`;
  function bindRefresh(fn) {
    const b = $('#refreshBtn');
    if (b) b.onclick = () => { b.firstElementChild.style.animation = 'spin .8s linear infinite'; fn(true); };
  }
  function skeleton() {
    return `<div class="page"><div class="card lift"><div class="skel" style="height:112px"></div></div>
      <div class="card"><div class="skel" style="height:18px;width:40%"></div><div class="skel" style="height:120px;margin-top:12px"></div></div></div>`;
  }
  function fail(e) { F.toast(F.errorText(e), 'bad'); }

  async function ensureList(force) {
    if (!state.list || force) {
      state.list = await call('alfikr_admin_list');
      state.tz = state.list.settings.timezone;
      state.company = state.list.settings.company_name;
    }
    return state.list;
  }

  /* ───────── TODAY ───────── */
  async function loadToday(force) {
    if (!state.overview || force !== true) view(hero('لوحة اليوم', state.company || 'الفكر السعد') + skeleton());
    try {
      const o = await call('alfikr_admin_overview', { p_date: state.date });
      state.overview = o; state.tz = o.timezone; state.company = o.company;
      if (!state.date) state.date = o.today;
      if (state.tab !== 'today') return; // the admin moved to another tab while this loaded
      renderToday();
      clearInterval(state.timer);
      state.timer = setInterval(async () => {
        if (state.tab !== 'today' || document.hidden) return;
        try { const o = await call('alfikr_admin_overview', { p_date: state.date }); state.overview = o; if (state.tab === 'today') renderToday(true); } catch (e) {}
      }, 30000);
    } catch (e) { fail(e); }
  }

  function bucket(r) {
    if (!r.check_in) return 'absent';
    if (!r.last_in) return 'out';
    return r.status;
  }

  function renderToday(quiet) {
    const o = state.overview, rows = o.rows, tz = o.timezone;
    const total = rows.length;
    const present = rows.filter((r) => r.check_in).length;
    const late = rows.filter((r) => r.status === 'late').length;
    const out = rows.filter((r) => r.check_in && !r.last_in).length;
    const absent = total - present;
    const pct = total ? Math.round((present / total) * 100) : 0;
    const C = 2 * Math.PI * 48;
    const isToday = state.date === o.today;
    const counts = { all: total, in: rows.filter((r) => r.last_in).length, late, absent, out };

    const q = state.q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const b = bucket(r);
      if (state.filter === 'in' && !r.last_in) return false;
      if (state.filter === 'late' && r.status !== 'late') return false;
      if (state.filter === 'absent' && b !== 'absent') return false;
      if (state.filter === 'out' && b !== 'out') return false;
      return !q || (r.name + ' ' + r.code + ' ' + (r.phone || '') + ' ' + (r.department || '') + ' ' + (r.in_site || '')).toLowerCase().includes(q);
    });

    const maxWeek = Math.max(total, ...o.week.map((w) => w.on_time + w.late), 1);
    const bars = o.week.map((w, i) => {
      const on = (w.on_time / maxWeek) * 100, lt = (w.late / maxWeek) * 100;
      const day = new Date(w.d + 'T12:00:00Z').toLocaleDateString(F.LOCALE, { weekday: 'short', timeZone: 'UTC' });
      return `<div class="col ${w.d === state.date ? 'sel' : ''}" data-d="${w.d}" style="cursor:pointer" title="${w.on_time + w.late}">
        <div class="stack"><div class="seg on" style="height:${on}%;animation-delay:${i * 60}ms"></div><div class="seg late" style="height:${lt}%;animation-delay:${i * 60 + 80}ms"></div></div>
        <span class="lbl">${day}</span></div>`;
    }).join('');

    const chips = [['all', 'الكل'], ['in', 'في العمل'], ['late', 'متأخر'], ['absent', 'غائب'], ['out', 'انصرف']]
      .map(([k, l]) => `<button class="chip ${state.filter === k ? 'active' : ''}" data-f="${k}">${l}<b>${counts[k]}</b></button>`).join('');

    const items = filtered.map((r, i) => {
      const b = bucket(r);
      const pill = b === 'out' ? `${F.statusPill(r.status)}` : F.statusPill(b === 'absent' ? 'absent' : r.status);
      return `<div class="item tap" data-id="${r.id}" style="animation-delay:${Math.min(i, 14) * 30}ms">
        ${avatar(r)}
        <div class="meta"><div class="t">${F.esc(r.name)}</div>
          <div class="s">${r.in_site ? '📍 ' + F.esc(r.in_site) : F.esc(r.department || r.phone || '')}</div></div>
        <div class="times">${r.check_in ? `حضور <b class="num">${F.fmtTime(r.check_in, tz)}</b><br>انصراف <b class="num">${r.last_in ? '—' : F.fmtTime(r.check_out, tz)}</b>` : `<span class="num">${r.shift_start}</span>`}</div>
        ${pill}
      </div>`;
    }).join('');

    const dateLabel = F.fmtDate(state.date, { year: 'numeric' });
    view(hero('لوحة اليوم', F.esc(o.company), `
      <div class="date-nav">
        <button class="icon-btn" id="prevDay" aria-label="اليوم السابق"><svg class="flip-ltr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>
        <input class="input" type="date" id="dateInp" value="${state.date}" max="${o.today}" aria-label="${dateLabel}">
        <button class="icon-btn" id="nextDay" aria-label="اليوم التالي" ${isToday ? 'disabled style="opacity:.4"' : ''}><svg class="flip-ltr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg></button>
      </div>`) + `
    <div class="page">
      <div class="card lift">
        <div class="ring-row">
          <div class="ring"><svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="48"/>
            <circle class="bar" cx="56" cy="56" r="48" stroke-dasharray="${C}" stroke-dashoffset="${quiet ? C - (C * pct) / 100 : C}" id="ringBar"/></svg>
            <div class="pct"><div><b class="num" id="pctNum">${quiet ? pct : 0}%</b><span>نسبة الحضور</span></div></div></div>
          <div class="tiles">
            <div class="tile" style="--c:var(--ok)"><div class="k">حاضر</div><div class="v" data-count="${present}">0</div></div>
            <div class="tile" style="--c:var(--warn);animation-delay:60ms"><div class="k">متأخر</div><div class="v" data-count="${late}">0</div></div>
            <div class="tile" style="--c:var(--bad);animation-delay:120ms"><div class="k">غائب</div><div class="v" data-count="${absent}">0</div></div>
            <div class="tile" style="--c:var(--info);animation-delay:180ms"><div class="k">انصرف</div><div class="v" data-count="${out}">0</div></div>
          </div>
        </div>
        <p class="tiny muted center" style="margin:12px 0 0">${dateLabel} · ${total.toLocaleString(F.LOCALE)} موظف نشط${isToday ? ' · يتحدث تلقائياً' : ''}</p>
      </div>

      <div class="card">
        <div class="row between"><h3 style="margin:0">آخر 7 أيام</h3><span class="tiny muted">اضغط على يوم لعرضه</span></div>
        <div class="bars" id="bars">${bars}</div>
        <div class="legend"><span><i style="background:var(--brand)"></i>في الوقت</span><span><i style="background:var(--gold)"></i>متأخر</span></div>
      </div>

      <div class="section-title"><span>الموظفون</span></div>
      <div class="search"><input class="input" id="q" placeholder="ابحث بالاسم أو رقم الجوال أو الموقع" value="${F.esc(state.q)}">${F.ICONS.search}</div>
      <div class="chips" style="margin-top:10px">${chips}</div>
      <div style="margin-top:6px">${total === 0 ? emptyEmployees() : filtered.length ? `<div class="list">${items}</div>` : '<div class="card empty"><div class="ico">🔎</div>لا توجد نتائج</div>'}</div>
    </div>`);

    // animate
    $('.tiles').querySelectorAll('[data-count]').forEach((el) => {
      if (quiet) el.textContent = Number(el.dataset.count).toLocaleString(F.LOCALE);
      else F.countUp(el, Number(el.dataset.count), 900);
    });
    if (!quiet) requestAnimationFrame(() => requestAnimationFrame(() => {
      const bar = $('#ringBar'); if (bar) bar.style.strokeDashoffset = C - (C * pct) / 100;
      const n = $('#pctNum'); if (n) animatePct(n, pct);
    }));

    bindRefresh(() => loadToday(true));
    $('#prevDay').onclick = () => { state.date = F.addDays(state.date, -1); loadToday(true); };
    $('#nextDay').onclick = () => { if (!isToday) { state.date = F.addDays(state.date, 1); loadToday(true); } };
    $('#dateInp').onchange = (e) => { if (e.target.value) { state.date = e.target.value; loadToday(true); } };
    $('#bars').querySelectorAll('.col').forEach((c) => c.onclick = () => { state.date = c.dataset.d; loadToday(true); });
    document.querySelectorAll('.chip[data-f]').forEach((c) => c.onclick = () => { state.filter = c.dataset.f; renderToday(true); });
    const qi = $('#q');
    qi.oninput = () => {
      state.q = qi.value;
      const pos = qi.selectionStart;
      renderToday(true);
      const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos);
    };
    document.querySelectorAll('.item[data-id]').forEach((it) => it.onclick = () => dayDetail(rows.find((r) => r.id === it.dataset.id)));
    const addBtn = $('#goAddEmp'); if (addBtn) addBtn.onclick = () => { go('employees'); setTimeout(() => employeeForm(), 300); };
  }

  function animatePct(el, to) {
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 1100), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e) + '%';
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function emptyEmployees() {
    return `<div class="card empty"><div class="ico">👥</div><div class="bold" style="color:var(--ink)">لا يوجد موظفون بعد</div>
      <p class="small">أضف موظفيك ليبدأوا بتسجيل الحضور من جوالاتهم</p><button class="btn" id="goAddEmp">${F.ICONS.plus} إضافة موظف</button></div>`;
  }

  // Photo cache keeps signed URLs stable between auto-refreshes (they are valid for 1 hour).
  const photoCache = {};
  function photo(r, kind) {
    const url = r[kind + '_photo_url'];
    if (!url || !r.attendance_id) return null;
    const k = r.attendance_id + kind, c = photoCache[k];
    if (c && Date.now() - c.t < 40 * 60e3) return c.url;
    photoCache[k] = { url, t: Date.now() };
    return url;
  }
  function avatar(r) {
    const u = photo(r, 'in');
    return u ? `<div class="avatar photo"><img src="${F.esc(u)}" alt="" loading="lazy"></div>` : `<div class="avatar">${F.esc(F.initials(r.name))}</div>`;
  }
  const workedMs = (r) => Number(r.worked_minutes || 0) * 60000 + (r.last_in ? Math.max(0, Date.now() - new Date(r.last_in)) : 0);
  const mapLink = (lat, lng, label) => (lat != null ? `<a class="tiny map-link" target="_blank" rel="noopener" href="https://maps.google.com/?q=${lat},${lng}">${label || 'الخريطة ↗'}</a>` : '');
  const typePill = (t) => `<span class="pill ${t === 'in' ? 'ok' : 'out'}">${t === 'in' ? 'حضور' : 'انصراف'}</span>`;

  // One print as a card: live selfie, type, time, site, GPS accuracy and a map link.
  function printCard(p, withDate) {
    const tz = state.tz;
    return `<div class="proof">
      ${p.photo_url ? `<a class="proof-img" href="${F.esc(p.photo_url)}" target="_blank" rel="noopener"><img src="${F.esc(p.photo_url)}" alt="${p.type === 'in' ? 'صورة الحضور' : 'صورة الانصراف'}" loading="lazy"></a>` : '<div class="proof-img"><span>لا توجد صورة</span></div>'}
      <div class="proof-meta">${typePill(p.type)} <span class="num bold">${F.fmtTime(p.at, tz)}</span>
        ${withDate ? `<div class="tiny muted">${F.fmtDate(p.work_date, { year: 'numeric' })}</div>` : ''}
        ${p.site ? `<div class="tiny">📍 ${F.esc(p.site)}</div>` : ''}
        <div>${mapLink(p.lat, p.lng)}${p.accuracy != null ? ` <span class="tiny muted">±${p.accuracy} م</span>` : ''}</div>
      </div></div>`;
  }

  // Day detail: every print of this employee on the chosen day.
  function dayDetail(r) {
    F.sheet(`<div class="row" style="margin-bottom:14px">${avatar(r)}
      <div style="flex:1"><h3 style="margin:0">${F.esc(r.name)}</h3><div class="muted small">${F.esc(r.job_title || '')} <span class="code-tag num">${F.esc(r.phone || r.code)}</span></div></div>${F.statusPill(r.check_in ? r.status : 'absent')}</div>
      <div id="dayPrints">${r.check_in ? '<div class="proofs"><div class="skel" style="aspect-ratio:1"></div><div class="skel" style="aspect-ratio:1"></div></div>' : '<div class="card empty" style="box-shadow:none"><div class="ico">🕒</div>لم يسجّل حضوره في هذا اليوم</div>'}</div>
      <div class="card" style="box-shadow:none;margin-top:14px">
        <div class="kv"><span class="k">الدوام</span><span class="v num">${r.shift_start} – ${r.shift_end}</span></div>
        <div class="kv"><span class="k">مدة العمل</span><span class="v">${r.check_in ? F.fmtDuration(workedMs(r)) : '—'}</span></div>
      </div>
      ${r.attendance_id ? `<button class="btn soft-danger block" id="dayDel" style="margin-top:14px">${F.ICONS.trash} حذف بصمات هذا اليوم</button>` : ''}
      <button class="btn ghost block" data-close style="margin-top:10px">إغلاق</button>`, async (el, close) => {
      const del = $('#dayDel', el);
      if (del) del.onclick = async () => {
        close();
        if (!(await F.confirmSheet('حذف بصمات هذا اليوم', 'سيتم حذف كل بصمات وصور هذا الموظف لهذا اليوم، ويمكنه التسجيل من جديد.', 'حذف'))) return;
        try { await call('alfikr_admin_delete_attendance', { p_id: r.attendance_id }); F.toast('تم حذف السجل', 'ok'); state.prints = null; loadToday(true); } catch (e) { fail(e); }
      };
      if (!r.check_in) return;
      try {
        const res = await call('alfikr_admin_punches', { p_from: state.date, p_to: state.date, p_employee: r.id, p_limit: 100 });
        const box = $('#dayPrints', el);
        if (box) box.innerHTML = `<div class="proofs">${res.items.slice().reverse().map((p) => printCard(p)).join('')}</div>`;
      } catch (e) { fail(e); }
    });
  }

  /* ───────── EMPLOYEES ───────── */
  async function loadEmployees(force) {
    if (!state.list) view(hero('الموظفون', 'إدارة فريق العمل') + skeleton());
    try { await ensureList(force === true || !state.list); if (state.tab === 'employees') renderEmployees(); } catch (e) { fail(e); }
  }
  function renderEmployees() {
    const emps = state.list.employees;
    const q = state.empQ.trim().toLowerCase();
    const list = emps.filter((e) => !q || (e.name + ' ' + e.code + ' ' + (e.phone || '') + ' ' + (e.department || '') + ' ' + (e.job_title || '')).toLowerCase().includes(q));
    const active = emps.filter((e) => e.active).length;
    const pinText = (e) => (e.pin ? (state.showPins || state.shownPin === e.id ? e.pin : '••••') : '—');
    const items = list.map((e, i) => `<div class="item tap emp-row" data-id="${e.id}" style="animation-delay:${Math.min(i, 14) * 30}ms">
      <div class="avatar" ${e.active ? '' : 'style="filter:grayscale(1);opacity:.6"'}>${F.esc(F.initials(e.name))}</div>
      <div class="meta"><div class="t">${F.esc(e.name)} ${e.active ? '' : '<span class="pill mute">موقوف</span>'}</div>
        <div class="s"><span class="num">${F.esc(e.phone || '')}</span> · 🕒 <span class="num">${e.shift_start}–${e.shift_end}</span>${[e.job_title, e.department].filter(Boolean).length ? ' · ' + F.esc([e.job_title, e.department].filter(Boolean).join(' · ')) : ''}</div></div>
      <button class="pin-chip" data-pin="${e.id}" aria-label="الرمز السري"><span class="tiny muted">الرمز</span> <b class="num">${pinText(e)}</b> ${e.pin ? F.ICONS.eye : ''}</button>
      <button class="icon-btn sm" data-reset="${e.id}" aria-label="إعادة تعيين الرمز السري" title="إعادة تعيين الرمز السري">${F.ICONS.key}</button>
    </div>`).join('');
    view(hero('الموظفون', `${active.toLocaleString(F.LOCALE)} نشط من ${emps.length.toLocaleString(F.LOCALE)}`) + `
      <div class="page"><div class="card lift" style="padding:12px">
        <div class="search"><input class="input" id="eq" placeholder="ابحث عن موظف" value="${F.esc(state.empQ)}">${F.ICONS.search}</div>
        <div class="row between" style="margin-top:10px;padding:0 4px"><span class="tiny muted">الاسم · الجوال · الرمز السري</span>
          <button class="chip ${state.showPins ? 'active' : ''}" id="togglePins">${state.showPins ? 'إخفاء الرموز' : 'إظهار الرموز'}</button></div></div>
        <div style="margin-top:14px">${emps.length === 0 ? emptyEmployees() : list.length ? `<div class="list">${items}</div>` : '<div class="card empty"><div class="ico">🔎</div>لا توجد نتائج</div>'}</div>
      </div>`);
    bindRefresh(() => loadEmployees(true));
    const eq = $('#eq');
    eq.oninput = () => { state.empQ = eq.value; const p = eq.selectionStart; renderEmployees(); const n = $('#eq'); n.focus(); n.setSelectionRange(p, p); };
    document.querySelectorAll('.item[data-id]').forEach((it) => it.onclick = () => hoursSheet(emps.find((e) => e.id === it.dataset.id)));
    document.querySelectorAll('[data-pin]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      const e = emps.find((x) => x.id === b.dataset.pin);
      if (!e.pin) return F.toast('الرمز غير محفوظ، أعد تعيينه لعرضه');
      state.shownPin = state.shownPin === e.id ? null : e.id;
      renderEmployees();
    });
    document.querySelectorAll('[data-reset]').forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); resetPin(emps.find((x) => x.id === b.dataset.reset)); });
    $('#togglePins').onclick = () => { state.showPins = !state.showPins; state.shownPin = null; renderEmployees(); };
    const ab = $('#goAddEmp'); if (ab) ab.onclick = () => employeeForm();
    addFab(() => employeeForm());
  }

  // Tapping an employee: change their working hours (with presets), or jump to other actions.
  const SHIFT_PRESETS = [['07:00', '15:00'], ['08:00', '16:00'], ['08:00', '17:00'], ['09:00', '17:00'], ['09:00', '18:00']];
  function shiftLength(a, b) {
    const toMin = (x) => { const [h, m] = String(x || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
    const mins = ((toMin(b) - toMin(a)) + 1440) % 1440 || 1440;
    return F.fmtDuration(mins * 60000);
  }
  function hoursSheet(e) {
    F.sheet(`<div class="row" style="margin-bottom:16px"><div class="avatar" style="background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--brand);border:0">${F.esc(F.initials(e.name))}</div>
      <div style="flex:1"><h3 style="margin:0">${F.esc(e.name)}</h3><div class="muted small num">${F.esc(e.phone || '')}</div></div></div>
      <div class="hours-card">
        <div class="row between"><b>أوقات الدوام</b><span class="pill info" id="hLen">${shiftLength(e.shift_start, e.shift_end)}</span></div>
        <div class="form-row" style="margin-top:12px">
          <label class="field"><span>بداية الدوام</span><input class="input time-big" type="time" id="hStart" value="${e.shift_start}"></label>
          <label class="field"><span>نهاية الدوام</span><input class="input time-big" type="time" id="hEnd" value="${e.shift_end}"></label>
        </div>
        <div class="tiny muted" style="margin:-4px 0 8px">اختيار سريع</div>
        <div class="chips" id="hPresets">${SHIFT_PRESETS.map(([a, b]) => `<button type="button" class="chip ${a === e.shift_start && b === e.shift_end ? 'active' : ''}" data-a="${a}" data-b="${b}"><span class="num">${a}–${b}</span></button>`).join('')}</div>
        <p class="tiny muted" style="margin:8px 0 0">يُحسب التأخير من بداية الدوام بعد مهلة التأخير المحددة في الإعدادات.</p>
      </div>
      <button class="btn block" id="hSave" style="margin-top:16px">حفظ أوقات الدوام</button>
      <div class="grid-2" style="margin-top:10px">
        <button class="btn ghost" id="hEdit">${F.ICONS.user} تعديل البيانات</button>
        <button class="btn ghost" id="hPin">${F.ICONS.key} إعادة تعيين الرمز</button>
      </div>
      <button class="btn ghost block" data-close style="margin-top:10px">إغلاق</button>`, (el, close) => {
      const start = $('#hStart', el), end = $('#hEnd', el), len = $('#hLen', el);
      const sync = () => {
        len.textContent = shiftLength(start.value, end.value);
        el.querySelectorAll('#hPresets .chip').forEach((c) => c.classList.toggle('active', c.dataset.a === start.value && c.dataset.b === end.value));
      };
      start.oninput = end.oninput = sync;
      el.querySelectorAll('#hPresets .chip').forEach((c) => c.onclick = () => { start.value = c.dataset.a; end.value = c.dataset.b; sync(); F.vibrate(8); });
      $('#hEdit', el).onclick = () => { close(); setTimeout(() => employeeForm(e), 260); };
      $('#hPin', el).onclick = () => { close(); setTimeout(() => resetPin(e), 260); };
      $('#hSave', el).onclick = async (ev) => {
        if (!start.value || !end.value) return F.toast(F.errorText({ code: 'missing_fields' }), 'bad');
        const btn = ev.currentTarget;
        F.busy(btn, true);
        try {
          await call('alfikr_admin_save_employee', { p: {
            id: e.id, name: e.name, phone: e.phone, code: e.code, job_title: e.job_title || '', department: e.department || '',
            active: e.active, shift_start: start.value, shift_end: end.value,
          } });
          e.shift_start = start.value; e.shift_end = end.value;
          close();
          F.toast('تم حفظ أوقات الدوام', 'ok');
          state.overview = null;
          if (state.tab === 'employees') renderEmployees();
        } catch (err) { fail(err); F.busy(btn, false); }
      };
    });
  }

  // Share sign-in details (WhatsApp / share sheet).
  function shareLogin(name, phone, pin) {
    const link = location.href.replace(/admin\.html.*$/, '');
    const text = F.lang === 'en'
      ? `Hello ${name}\nAttendance link: ${link}\nMobile number: ${phone}\nPIN: ${pin}`
      : `مرحباً ${name}\nرابط تسجيل الحضور: ${link}\nرقم الجوال: ${phone}\nالرمز السري: ${pin}`;
    if (navigator.share) navigator.share({ title: F.T('الفكر السعد'), text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
  function loginCard(name, phone, pin) {
    F.sheet(`<div class="confirm-box"><div class="ico" style="background:var(--ok-bg);color:var(--ok)">✓</div><h3>${F.esc(name)}</h3>
      <p class="muted small">أرسل بيانات الدخول للموظف:</p></div>
      <div class="card" style="box-shadow:none"><div class="kv"><span class="k">الرابط</span><span class="v tiny num">${F.esc(location.href.replace(/admin\.html.*$/, ''))}</span></div>
      <div class="kv"><span class="k">رقم الجوال</span><span class="v num">${F.esc(phone)}</span></div>
      <div class="kv"><span class="k">الرمز السري</span><span class="v num" style="font-size:20px;letter-spacing:.15em">${F.esc(pin)}</span></div></div>
      <div class="grid-2" style="margin-top:14px"><button class="btn ghost" id="shareBtn">مشاركة</button><button class="btn" data-close>تم</button></div>`,
    (el) => { $('#shareBtn', el).onclick = () => shareLogin(name, phone, pin); });
  }
  function resetPin(e) {
    const suggestion = String(Math.floor(1000 + Math.random() * 9000));
    F.sheet(`<h3>إعادة تعيين الرمز السري</h3><p class="muted small" style="margin-top:-10px">${F.esc(e.name)} · <span class="num">${F.esc(e.phone || '')}</span></p>
      <label class="field"><span>الرمز السري الجديد</span><input class="input pin-input" id="newPin" inputmode="numeric" maxlength="8" value="${suggestion}"></label>
      <p class="tiny muted" style="margin-top:-6px">سيتم تسجيل خروج الموظف من جميع الأجهزة، ويدخل بالرمز الجديد.</p>
      <button class="btn block" id="pinSave">حفظ الرمز الجديد</button>
      <button class="btn ghost block" data-close style="margin-top:10px">إلغاء</button>`, (el, close) => {
      $('#pinSave', el).onclick = async (ev) => {
        const pin = $('#newPin', el).value.trim();
        if (!/^\d{4,8}$/.test(pin)) return F.toast(F.errorText({ code: 'bad_pin' }), 'bad');
        F.busy(ev.currentTarget, true);
        try {
          const r = await call('alfikr_admin_reset_pin', { p_id: e.id, p_pin: pin });
          e.pin = r.pin;
          close();
          F.toast('تم تغيير الرمز السري', 'ok');
          if (state.tab === 'employees') renderEmployees();
          loginCard(e.name, e.phone || '', r.pin);
        } catch (err) { fail(err); F.busy(ev.currentTarget, false); }
      };
    });
  }
  function addFab(fn) {
    document.querySelectorAll('.fab').forEach((f) => f.remove());
    const b = document.createElement('button');
    b.className = 'fab'; b.setAttribute('aria-label', 'إضافة'); b.innerHTML = F.ICONS.plus; b.onclick = fn;
    document.body.appendChild(b);
  }

  function employeeForm(emp) {
    const e = emp || { active: true, shift_start: '08:00', shift_end: '16:00' };
    F.sheet(`<h3>${emp ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</h3>
      <form id="empForm">
        <label class="field"><span>الاسم الكامل *</span><input class="input" name="name" value="${F.esc(e.name || '')}" required></label>
        <div class="form-row">
          <label class="field"><span>رقم الجوال * (للدخول)</span><input class="input ltr" name="phone" type="tel" inputmode="tel" value="${F.esc(e.phone || '')}" placeholder="05xxxxxxxx" required></label>
          <label class="field"><span>${emp ? 'رمز سري جديد' : 'الرمز السري *'}</span><input class="input ltr" name="pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" placeholder="${emp ? 'اتركه فارغاً' : '4-8 أرقام'}" ${emp ? '' : 'required'} value="${emp ? '' : String(Math.floor(1000 + Math.random() * 9000))}"></label>
        </div>
        <div class="form-row">
          <label class="field"><span>المسمى الوظيفي</span><input class="input" name="job_title" value="${F.esc(e.job_title || '')}"></label>
          <label class="field"><span>القسم</span><input class="input" name="department" value="${F.esc(e.department || '')}"></label>
        </div>
        <label class="field"><span>الرقم الوظيفي (اختياري)</span><input class="input ltr" name="code" inputmode="numeric" value="${F.esc(e.code || '')}" placeholder="يُولَّد تلقائياً"></label>
        <div class="form-row">
          <label class="field"><span>بداية الدوام</span><input class="input" type="time" name="shift_start" value="${e.shift_start}"></label>
          <label class="field"><span>نهاية الدوام</span><input class="input" type="time" name="shift_end" value="${e.shift_end}"></label>
        </div>
        <div class="toggle-row"><div><div class="bold">حساب نشط</div><div class="tiny muted">إيقاف الحساب يمنع الموظف من تسجيل الدخول</div></div>
          <label class="switch"><input type="checkbox" name="active" ${e.active ? 'checked' : ''}><i></i></label></div>
        <button class="btn block" type="submit" id="empSave">${emp ? 'حفظ التعديلات' : 'إضافة الموظف'}</button>
        ${emp ? `<button class="btn soft-danger block" type="button" id="empDel" style="margin-top:10px">${F.ICONS.trash} حذف الموظف</button>` : ''}
      </form>`, (el, close) => {
      const form = $('#empForm', el);
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const fd = new FormData(form);
        const p = Object.fromEntries(fd.entries());
        p.active = form.active.checked;
        if (emp) p.id = emp.id;
        const btn = $('#empSave', el);
        F.busy(btn, true);
        try {
          await call('alfikr_admin_save_employee', { p });
          close();
          if (!emp) loginCard(p.name, p.phone, p.pin);
          else F.toast('تم حفظ التعديلات', 'ok');
          await ensureList(true);
          state.overview = null;
          renderEmployees();
        } catch (e) { fail(e); } finally { F.busy(btn, false); }
      };
      const del = $('#empDel', el);
      if (del) del.onclick = async () => {
        close();
        const ok = await F.confirmSheet('حذف الموظف', `سيتم حذف ${emp.name} وجميع سجلات حضوره نهائياً. يمكنك بدلاً من ذلك إيقاف الحساب.`, 'حذف نهائي');
        if (!ok) return;
        try { await call('alfikr_admin_delete_employee', { p_id: emp.id }); F.toast('تم حذف الموظف', 'ok'); await ensureList(true); renderEmployees(); } catch (e) { fail(e); }
      };
    });
  }

  /* ───────── PRINTS (every check-in/out ever) ───────── */
  async function loadRecords(force) {
    try {
      await ensureList();
      if (!state.prints || force) view(hero('كل البصمات', 'كل بصمة مع الصورة والموقع') + skeleton());
      const res = await call('alfikr_admin_punches', { p_from: state.recFrom || null, p_to: state.recTo || null, p_employee: state.recEmp || null, p_limit: 40 });
      state.prints = { items: res.items, next: res.next_before };
      if (state.tab === 'records') renderPrints();
    } catch (e) { fail(e); }
  }
  async function moreprints(btn) {
    F.busy(btn, true);
    try {
      const res = await call('alfikr_admin_punches', { p_from: state.recFrom || null, p_to: state.recTo || null, p_employee: state.recEmp || null, p_limit: 40, p_before: state.prints.next });
      state.prints.items = state.prints.items.concat(res.items);
      state.prints.next = res.next_before;
      const y = window.scrollY; renderPrints(); window.scrollTo({ top: y });
    } catch (e) { fail(e); F.busy(btn, false); }
  }
  function renderPrints() {
    const tz = state.tz, items = state.prints.items;
    const ins = items.filter((p) => p.type === 'in').length;
    const people = new Set(items.map((p) => p.employee_id)).size;
    const empOpts = '<option value="">كل الموظفين</option>' + state.list.employees.map((e) => `<option value="${e.id}" ${e.id === state.recEmp ? 'selected' : ''}>${F.esc(e.name)}</option>`).join('');
    let lastDate = null;
    const rows = items.map((p, i) => {
      let head = '';
      if (p.work_date !== lastDate) { lastDate = p.work_date; head = `<div class="item day-head">${F.fmtDate(p.work_date, { year: 'numeric' })}</div>`; }
      return head + `<div class="item tap" data-pid="${p.id}" style="animation-delay:${Math.min(i % 40, 14) * 25}ms">
        ${p.photo_url ? `<div class="avatar photo sq"><img src="${F.esc(p.photo_url)}" alt="" loading="lazy"></div>` : `<div class="avatar sq">${F.esc(F.initials(p.name))}</div>`}
        <div class="meta"><div class="t">${F.esc(p.name)}</div>
          <div class="s"><span class="num">${F.fmtTime(p.at, tz)}</span>${p.site ? ' · ' + F.esc(p.site) : ''}${p.accuracy != null ? ' · ±' + p.accuracy + ' م' : ''}</div></div>
        ${typePill(p.type)}</div>`;
    }).join('');
    view(hero('كل البصمات', 'كل بصمة مع الصورة والموقع') + `
      <div class="page">
        <div class="card lift">
          <div class="form-row">
            <label class="field"><span>من</span><input class="input" type="date" id="rf" value="${state.recFrom || ''}"></label>
            <label class="field"><span>إلى</span><input class="input" type="date" id="rt" value="${state.recTo || ''}"></label>
          </div>
          <label class="field"><span>الموظف</span><select class="input" id="re">${empOpts}</select></label>
          <div class="grid-2"><button class="btn" id="rApply">عرض</button><button class="btn ghost" id="rCsv">${F.ICONS.download} تصدير Excel</button></div>
          <p class="tiny muted center" style="margin:10px 0 0">اترك التاريخ فارغاً لعرض كل البصمات منذ البداية</p>
        </div>
        <div class="card"><div class="stats3">
          <div><div class="k">البصمات المعروضة</div><div class="v">${items.length.toLocaleString(F.LOCALE)}${state.prints.next ? '+' : ''}</div></div>
          <div><div class="k">حضور / انصراف</div><div class="v"><span style="color:var(--ok)">${ins}</span> / <span style="color:#ea580c">${items.length - ins}</span></div></div>
          <div><div class="k">الموظفون</div><div class="v">${people.toLocaleString(F.LOCALE)}</div></div>
        </div></div>
        <div style="margin-top:14px">${items.length ? `<div class="list">${rows}</div>` : '<div class="card empty"><div class="ico">🗂️</div>لا توجد بصمات</div>'}</div>
        ${state.prints.next ? `<button class="btn ghost block" id="morePrints" style="margin-top:14px">تحميل المزيد</button>` : (items.length ? '<p class="tiny muted center" style="margin-top:14px">— نهاية السجل —</p>' : '')}
      </div>`);
    bindRefresh(() => loadRecords(true));
    $('#rApply').onclick = () => {
      state.recFrom = $('#rf').value || null; state.recTo = $('#rt').value || null; state.recEmp = $('#re').value;
      if (state.recFrom && state.recTo && state.recFrom > state.recTo) { const t = state.recFrom; state.recFrom = state.recTo; state.recTo = t; }
      loadRecords(true);
    };
    $('#rCsv').onclick = (ev) => exportCsv(ev.currentTarget);
    const more = $('#morePrints'); if (more) more.onclick = () => moreprints(more);
    document.querySelectorAll('.item[data-pid]').forEach((it) => it.onclick = () => printDetail(items.find((p) => p.id === it.dataset.pid)));
  }
  function printDetail(p) {
    F.sheet(`<div class="row between" style="margin-bottom:12px"><div><h3 style="margin:0">${F.esc(p.name)}</h3>
      <div class="muted small num">${F.esc(p.phone || '')}</div></div>${typePill(p.type)}</div>
      ${p.photo_url ? `<a href="${F.esc(p.photo_url)}" target="_blank" rel="noopener"><img class="big-photo" src="${F.esc(p.photo_url)}" alt="${p.type === 'in' ? 'صورة الحضور' : 'صورة الانصراف'}"></a>` : '<div class="card empty">لا توجد صورة</div>'}
      <div class="card" style="box-shadow:none;margin-top:14px">
        <div class="kv"><span class="k">التاريخ</span><span class="v">${F.fmtDate(p.work_date, { year: 'numeric' })}</span></div>
        <div class="kv"><span class="k">الوقت</span><span class="v num">${F.fmtTime(p.at, state.tz)}</span></div>
        ${p.site ? `<div class="kv"><span class="k">الموقع</span><span class="v">${F.esc(p.site)}</span></div>` : ''}
        ${p.lat != null ? `<div class="kv"><span class="k">الإحداثيات</span><span class="v tiny"><span class="num">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</span>${p.accuracy != null ? ` <span class="muted">±${p.accuracy} م</span>` : ''}</span></div>` : ''}
      </div>
      ${p.lat != null ? `<a class="btn block" style="margin-top:14px;text-decoration:none" target="_blank" rel="noopener" href="https://maps.google.com/?q=${p.lat},${p.lng}">${F.ICONS.pin} فتح على الخريطة</a>` : ''}
      <button class="btn ghost block" data-close style="margin-top:10px">إغلاق</button>`);
  }
  // Exports every print matching the filters (all pages), with date, time, site and coordinates.
  async function exportCsv(btn) {
    F.busy(btn, true);
    try {
      let all = [], before = null;
      for (let i = 0; i < 100; i++) {
        const res = await call('alfikr_admin_punches', { p_from: state.recFrom || null, p_to: state.recTo || null, p_employee: state.recEmp || null, p_limit: 100, p_before: before });
        all = all.concat(res.items);
        before = res.next_before;
        if (!before) break;
      }
      const tz = state.tz;
      const t = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const rows = [['التاريخ', 'الوقت', 'الاسم', 'الجوال', 'النوع', 'الموقع', 'الإحداثيات', 'الدقة (م)'].map(F.T)];
      all.reverse().forEach((p) => rows.push([p.work_date, t(p.at), p.name, p.phone || '', F.T(p.type === 'in' ? 'حضور' : 'انصراف'),
        p.site || '', p.lat != null ? `${p.lat},${p.lng}` : '', p.accuracy != null ? p.accuracy : '']));
      const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `prints_${state.recFrom || 'all'}_${state.recTo || F.todayISO(tz)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      F.toast('تم تصدير الملف', 'ok');
    } catch (e) { fail(e); } finally { F.busy(btn, false); }
  }

  /* ───────── SETTINGS ───────── */
  async function loadSettings(force) {
    try { await ensureList(force === true); if (state.tab === 'settings') renderSettings(); } catch (e) { fail(e); }
  }
  function renderSettings() {
    const s = state.list.settings;
    const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone].concat(TIMEZONES);
    const empUrl = location.href.replace(/admin\.html.*$/, '');
    view(hero('الإعدادات', 'إعدادات المنشأة') + `
      <div class="page">
        <form class="card lift" id="setForm">
          <h3>المنشأة</h3>
          <label class="field"><span>اسم المنشأة</span><input class="input" name="company_name" value="${F.esc(s.company_name)}"></label>
          <label class="field"><span>المنطقة الزمنية</span><select class="input" name="timezone">${tzs.map((t) => `<option ${t === s.timezone ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>مهلة التأخير (دقائق)</span><input class="input ltr" type="number" min="0" max="240" name="grace_minutes" value="${s.grace_minutes}"></label>
          <h3 style="margin-top:22px">الأمان</h3>
          <label class="field"><span>كلمة مرور جديدة للوحة التحكم</span><input class="input ltr" type="password" name="new_password" autocomplete="new-password" placeholder="اتركها فارغة لعدم التغيير"></label>
          <button class="btn block" id="setSave" type="submit">حفظ الإعدادات</button>
        </form>
        <div class="card">
          <div class="row between"><div><h3 style="margin:0">اللغة</h3><div class="muted small">اختر لغة التطبيق</div></div>${F.langSwitch('lg')}</div>
        </div>
        <div class="card">
          <h3>رابط الموظفين</h3>
          <p class="muted small" style="margin-top:-4px">شارك هذا الرابط مع موظفيك لتسجيل الحضور من جوالاتهم</p>
          <div class="row"><input class="input ltr small" readonly value="${F.esc(empUrl)}" id="empUrl"><button class="btn sm" id="copyUrl">نسخ</button></div>
        </div>
        <button class="btn soft-danger block" id="logoutBtn" style="margin-top:16px">${F.ICONS.logout} تسجيل الخروج</button>
      </div>`);
    bindRefresh(() => loadSettings(true));
    $('#copyUrl').onclick = async () => {
      try { await navigator.clipboard.writeText(empUrl); } catch (e) { $('#empUrl').select(); document.execCommand('copy'); }
      F.toast('تم نسخ الرابط', 'ok');
    };
    $('#logoutBtn').onclick = () => logout();
    $('#setForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const p = Object.fromEntries(new FormData(ev.target).entries());
      const btn = $('#setSave');
      F.busy(btn, true);
      try {
        await call('alfikr_admin_save_settings', { p });
        F.toast(p.new_password ? 'تم الحفظ وتغيير كلمة المرور' : 'تم حفظ الإعدادات', 'ok');
        state.overview = null;
        await ensureList(true); renderSettings();
      } catch (e) { fail(e); } finally { F.busy(btn, false); }
    };
  }

  // Re-draw the current screen in the newly chosen language (from data already loaded).
  window.addEventListener('fikr:lang', () => {
    if (!state.token || $('#app').classList.contains('hidden')) return;
    const r = { today: state.overview && (() => renderToday(true)), employees: state.list && renderEmployees,
      records: state.prints && renderPrints, settings: state.list && renderSettings }[state.tab];
    if (r) r(); else go(state.tab);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.token && state.tab === 'today' && state.overview) loadToday(true);
  });

  if (state.token) showApp(); else showLogin();
})();
