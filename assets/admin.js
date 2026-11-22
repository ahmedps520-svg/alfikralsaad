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
      <button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button></div>${extra || ''}</header>`;
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
      renderToday();
      clearInterval(state.timer);
      state.timer = setInterval(async () => {
        if (state.tab !== 'today' || document.hidden) return;
        try { state.overview = await call('alfikr_admin_overview', { p_date: state.date }); renderToday(true); } catch (e) {}
      }, 30000);
    } catch (e) { fail(e); }
  }

  function bucket(r) {
    if (!r.check_in) return 'absent';
    if (r.check_out) return 'out';
    return r.status;
  }

  function renderToday(quiet) {
    const o = state.overview, rows = o.rows, tz = o.timezone;
    const total = rows.length;
    const present = rows.filter((r) => r.check_in).length;
    const late = rows.filter((r) => r.status === 'late').length;
    const out = rows.filter((r) => r.check_out).length;
    const absent = total - present;
    const pct = total ? Math.round((present / total) * 100) : 0;
    const C = 2 * Math.PI * 48;
    const isToday = state.date === o.today;
    const counts = { all: total, in: present - out, late, absent, out };

    const q = state.q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      const b = bucket(r);
      if (state.filter === 'in' && !(r.check_in && !r.check_out)) return false;
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
        <div class="times">${r.check_in ? `دخول <b class="num">${F.fmtTime(r.check_in, tz)}</b><br>خروج <b class="num">${F.fmtTime(r.check_out, tz)}</b>` : `<span class="num">${r.shift_start}</span>`}</div>
        ${pill}
      </div>`;
    }).join('');

    const dateLabel = F.fmtDate(state.date, { year: 'numeric' });
    view(hero('لوحة اليوم', F.esc(o.company), `
      <div class="date-nav">
        <button class="icon-btn" id="prevDay" aria-label="اليوم السابق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>
        <input class="input" type="date" id="dateInp" value="${state.date}" max="${o.today}" aria-label="${dateLabel}">
        <button class="icon-btn" id="nextDay" aria-label="اليوم التالي" ${isToday ? 'disabled style="opacity:.4"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg></button>
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
  // The proof for one check-in/out: live selfie, time, site, GPS accuracy and a map link.
  function evidence(r) {
    const tz = state.tz;
    const side = (kind, label) => {
      const t = r[kind === 'in' ? 'check_in' : 'check_out'];
      if (!t) return `<div class="proof empty-proof"><div class="proof-img"><span>${label}<br>لم يُسجّل</span></div></div>`;
      const u = photo(r, kind), lat = r[kind + '_lat'], lng = r[kind + '_lng'], acc = r[kind + '_accuracy'], site = r[kind + '_site'];
      return `<div class="proof">
        ${u ? `<a class="proof-img" href="${F.esc(u)}" target="_blank" rel="noopener"><img src="${F.esc(u)}" alt="صورة ${label}"></a>` : '<div class="proof-img"><span>لا توجد صورة</span></div>'}
        <div class="proof-meta"><b>${label}</b> <span class="num">${F.fmtTime(t, tz)}</span>
          ${site ? `<div class="tiny">📍 ${F.esc(site)}</div>` : ''}
          ${lat != null ? `<a class="tiny" target="_blank" rel="noopener" href="https://maps.google.com/?q=${lat},${lng}">الخريطة ↗</a>${acc != null ? ` <span class="tiny muted">±${acc} م</span>` : ''}` : ''}
        </div></div>`;
    };
    return `<div class="proofs">${side('in', 'الحضور')}${side('out', 'الانصراف')}</div>`;
  }

  function dayDetail(r) {
    const dur = r.check_in && r.check_out ? F.fmtDuration(new Date(r.check_out) - new Date(r.check_in)) : '—';
    F.sheet(`<div class="row" style="margin-bottom:14px">${avatar(r)}
      <div style="flex:1"><h3 style="margin:0">${F.esc(r.name)}</h3><div class="muted small">${F.esc(r.job_title || '')} <span class="code-tag num">${F.esc(r.phone || r.code)}</span></div></div>${F.statusPill(r.check_in ? r.status : 'absent')}</div>
      ${r.check_in ? evidence(r) : '<div class="card empty" style="box-shadow:none"><div class="ico">🕒</div>لم يسجّل حضوره في هذا اليوم</div>'}
      <div class="card" style="box-shadow:none;margin-top:14px">
        <div class="kv"><span class="k">الدوام</span><span class="v num">${r.shift_start} – ${r.shift_end}</span></div>
        <div class="kv"><span class="k">مدة العمل</span><span class="v">${dur}</span></div>
      </div>
      <button class="btn ghost block" data-close style="margin-top:14px">إغلاق</button>`);
  }

  /* ───────── EMPLOYEES ───────── */
  async function loadEmployees(force) {
    if (!state.list) view(hero('الموظفون', 'إدارة فريق العمل') + skeleton());
    try { await ensureList(force === true || !state.list); renderEmployees(); } catch (e) { fail(e); }
  }
  function renderEmployees() {
    const emps = state.list.employees;
    const q = state.empQ.trim().toLowerCase();
    const list = emps.filter((e) => !q || (e.name + ' ' + e.code + ' ' + (e.phone || '') + ' ' + (e.department || '') + ' ' + (e.job_title || '')).toLowerCase().includes(q));
    const active = emps.filter((e) => e.active).length;
    const items = list.map((e, i) => `<div class="item tap" data-id="${e.id}" style="animation-delay:${Math.min(i, 14) * 30}ms">
      <div class="avatar" ${e.active ? '' : 'style="filter:grayscale(1);opacity:.6"'}>${F.esc(F.initials(e.name))}</div>
      <div class="meta"><div class="t">${F.esc(e.name)}</div>
        <div class="s"><span class="num">${F.esc(e.phone || '')}</span>${[e.job_title, e.department].filter(Boolean).length ? ' · ' + F.esc([e.job_title, e.department].filter(Boolean).join(' · ')) : ''}</div></div>
      ${e.active ? `<span class="tiny muted num">${e.shift_start}–${e.shift_end}</span>` : '<span class="pill mute">موقوف</span>'}
    </div>`).join('');
    view(hero('الموظفون', `${active.toLocaleString(F.LOCALE)} نشط من ${emps.length.toLocaleString(F.LOCALE)}`) + `
      <div class="page"><div class="card lift" style="padding:12px">
        <div class="search"><input class="input" id="eq" placeholder="ابحث عن موظف" value="${F.esc(state.empQ)}">${F.ICONS.search}</div></div>
        <div style="margin-top:14px">${emps.length === 0 ? emptyEmployees() : list.length ? `<div class="list">${items}</div>` : '<div class="card empty"><div class="ico">🔎</div>لا توجد نتائج</div>'}</div>
      </div>`);
    bindRefresh(() => loadEmployees(true));
    const eq = $('#eq');
    eq.oninput = () => { state.empQ = eq.value; const p = eq.selectionStart; renderEmployees(); const n = $('#eq'); n.focus(); n.setSelectionRange(p, p); };
    document.querySelectorAll('.item[data-id]').forEach((it) => it.onclick = () => employeeForm(emps.find((e) => e.id === it.dataset.id)));
    const ab = $('#goAddEmp'); if (ab) ab.onclick = () => employeeForm();
    addFab(() => employeeForm());
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
          if (!emp) {
            F.sheet(`<div class="confirm-box"><div class="ico" style="background:var(--ok-bg);color:var(--ok)">✓</div><h3>تمت إضافة ${F.esc(p.name)}</h3>
              <p class="muted small">أرسل بيانات الدخول للموظف:</p></div>
              <div class="card" style="box-shadow:none"><div class="kv"><span class="k">الرابط</span><span class="v tiny num">${F.esc(location.href.replace(/admin\.html.*$/, ''))}</span></div>
              <div class="kv"><span class="k">رقم الجوال</span><span class="v num">${F.esc(p.phone)}</span></div>
              <div class="kv"><span class="k">الرمز السري</span><span class="v num">${F.esc(p.pin)}</span></div></div>
              <div class="grid-2" style="margin-top:14px"><button class="btn ghost" id="shareBtn">مشاركة</button><button class="btn" data-close>تم</button></div>`, (el2) => {
              $('#shareBtn', el2).onclick = () => {
                const text = `مرحباً ${p.name}\nرابط تسجيل الحضور: ${location.href.replace(/admin\.html.*$/, '')}\nرقم الجوال: ${p.phone}\nالرمز السري: ${p.pin}`;
                if (navigator.share) navigator.share({ title: 'الفكر السعد', text }).catch(() => {});
                else { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
              };
            });
          } else F.toast('تم حفظ التعديلات', 'ok');
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

  /* ───────── RECORDS ───────── */
  async function loadRecords(force) {
    try {
      await ensureList();
      const today = F.todayISO(state.tz);
      if (!state.recTo) { state.recTo = today; state.recFrom = F.addDays(today, -6); }
      if (!state.records || force) view(hero('سجلات الحضور', 'تقارير وتصدير') + skeleton());
      state.records = await call('alfikr_admin_attendance', { p_from: state.recFrom, p_to: state.recTo, p_employee: state.recEmp || null, p_photos: true });
      renderRecords();
    } catch (e) { fail(e); }
  }
  function renderRecords() {
    const tz = state.tz, recs = state.records;
    const late = recs.filter((r) => r.status === 'late').length;
    const hours = recs.reduce((s, r) => s + (r.check_in && r.check_out ? new Date(r.check_out) - new Date(r.check_in) : 0), 0) / 36e5;
    const empOpts = '<option value="">كل الموظفين</option>' + state.list.employees.map((e) => `<option value="${e.id}" ${e.id === state.recEmp ? 'selected' : ''}>${F.esc(e.name)}</option>`).join('');
    let lastDate = null;
    const items = recs.map((r, i) => {
      let head = '';
      if (r.work_date !== lastDate) { lastDate = r.work_date; head = `<div class="item" style="background:var(--surface-2);padding:8px 16px;font-size:12px;font-weight:700;color:var(--muted)">${F.fmtDate(r.work_date, { year: 'numeric' })}</div>`; }
      const dur = r.check_in && r.check_out ? F.fmtDuration(new Date(r.check_out) - new Date(r.check_in)) : 'لم ينصرف';
      return head + `<div class="item tap" data-id="${r.id}" style="animation-delay:${Math.min(i, 14) * 25}ms">
        ${avatar(r)}
        <div class="meta"><div class="t">${F.esc(r.name)}</div><div class="s"><span class="num">${F.fmtTime(r.check_in, tz)}</span> ← <span class="num">${F.fmtTime(r.check_out, tz)}</span> · ${dur}${r.in_site ? ' · ' + F.esc(r.in_site) : ''}</div></div>
        ${F.statusPill(r.status)}</div>`;
    }).join('');
    view(hero('سجلات الحضور', 'تقارير وتصدير') + `
      <div class="page">
        <div class="card lift">
          <div class="form-row">
            <label class="field"><span>من</span><input class="input" type="date" id="rf" value="${state.recFrom}"></label>
            <label class="field"><span>إلى</span><input class="input" type="date" id="rt" value="${state.recTo}"></label>
          </div>
          <label class="field"><span>الموظف</span><select class="input" id="re">${empOpts}</select></label>
          <div class="grid-2"><button class="btn" id="rApply">عرض</button><button class="btn ghost" id="rCsv">${F.ICONS.download} تصدير Excel</button></div>
        </div>
        <div class="card"><div class="stats3">
          <div><div class="k">السجلات</div><div class="v">${recs.length.toLocaleString(F.LOCALE)}</div></div>
          <div><div class="k">التأخير</div><div class="v" style="color:var(--warn)">${late.toLocaleString(F.LOCALE)}</div></div>
          <div><div class="k">الساعات</div><div class="v">${Math.round(hours).toLocaleString(F.LOCALE)}</div></div>
        </div></div>
        <div style="margin-top:14px">${recs.length ? `<div class="list">${items}</div>` : '<div class="card empty"><div class="ico">🗂️</div>لا توجد سجلات في هذه الفترة</div>'}</div>
      </div>`);
    bindRefresh(() => loadRecords(true));
    $('#rApply').onclick = () => {
      state.recFrom = $('#rf').value || state.recFrom; state.recTo = $('#rt').value || state.recTo; state.recEmp = $('#re').value;
      if (state.recFrom > state.recTo) { const t = state.recFrom; state.recFrom = state.recTo; state.recTo = t; }
      loadRecords(true);
    };
    $('#rCsv').onclick = exportCsv;
    document.querySelectorAll('.item[data-id]').forEach((it) => it.onclick = () => recordDetail(recs.find((r) => r.id === it.dataset.id)));
  }
  function recordDetail(r) {
    F.sheet(`<h3>${F.esc(r.name)}</h3><p class="muted small" style="margin-top:-10px">${F.fmtDate(r.work_date, { year: 'numeric' })}</p>
      <div style="margin-bottom:12px">${F.statusPill(r.status)}</div>
      ${evidence(r)}
      <button class="btn soft-danger block" id="recDel" style="margin-top:14px">${F.ICONS.trash} حذف السجل</button>
      <button class="btn ghost block" data-close style="margin-top:10px">إغلاق</button>`, (el, close) => {
      $('#recDel', el).onclick = async () => {
        close();
        if (!(await F.confirmSheet('حذف السجل', 'سيتمكن الموظف من تسجيل البصمة لهذا اليوم من جديد.', 'حذف'))) return;
        try { await call('alfikr_admin_delete_attendance', { p_id: r.id }); F.toast('تم حذف السجل', 'ok'); state.overview = null; loadRecords(true); } catch (e) { fail(e); }
      };
    });
  }
  function exportCsv() {
    const tz = state.tz;
    const t = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '');
    const rows = [['التاريخ', 'الاسم', 'الجوال', 'القسم', 'الحضور', 'موقع الحضور', 'إحداثيات الحضور', 'الانصراف', 'موقع الانصراف', 'إحداثيات الانصراف', 'الساعات', 'الحالة']];
    const ll = (lat, lng) => (lat != null ? `${lat},${lng}` : '');
    state.records.slice().reverse().forEach((r) => rows.push([
      r.work_date, r.name, r.phone || '', r.department || '', t(r.check_in), r.in_site || '', ll(r.in_lat, r.in_lng),
      t(r.check_out), r.out_site || '', ll(r.out_lat, r.out_lng),
      r.check_in && r.check_out ? ((new Date(r.check_out) - new Date(r.check_in)) / 36e5).toFixed(2) : '',
      (F.STATUS[r.status] || {}).label || r.status,
    ]));
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `attendance_${state.recFrom}_${state.recTo}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    F.toast('تم تصدير الملف', 'ok');
  }

  /* ───────── SETTINGS ───────── */
  async function loadSettings(force) {
    try { await ensureList(force === true); renderSettings(); } catch (e) { fail(e); }
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

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.token && state.tab === 'today' && state.overview) loadToday(true);
  });

  if (state.token) showApp(); else showLogin();
})();
