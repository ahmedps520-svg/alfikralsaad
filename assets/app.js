/* الفكر السعد — employee app */
(function () {
  const F = window.Fikr;
  const $ = (s, el) => (el || document).querySelector(s);
  const TOKEN_KEY = 'fikr.emp.token';

  const state = { token: F.store.get(TOKEN_KEY), me: null, tab: 'home', offset: 0, pos: null, geo: 'pending', timers: [] };

  document.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = F.ICONS[el.dataset.icon]; });

  /* ───────── boot ───────── */
  async function boot() {
    if (!state.token) return showLogin();
    try {
      await loadMe();
      showApp();
    } catch (e) {
      if (e.code === 'unauthorized') return logout(true);
      showLogin();
      F.toast(F.errorText(e), 'bad');
    }
  }

  async function loadMe() {
    const me = await F.rpc('alfikr_emp_me', { p_token: state.token });
    state.me = me;
    state.offset = new Date(me.server_now).getTime() - Date.now();
    return me;
  }

  function showLogin() {
    $('#app').classList.add('hidden');
    $('#tabbar').classList.add('hidden');
    $('#login').classList.remove('hidden');
    const saved = F.store.get('fikr.emp.code');
    if (saved) { $('#code').value = saved; }
    setTimeout(() => (saved ? $('#pin') : $('#code')).focus(), 400);
  }

  function showApp() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#tabbar').classList.remove('hidden');
    startGeo();
    render();
  }

  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#loginBtn');
    const code = $('#code').value.trim();
    const pin = $('#pin').value.trim();
    if (!code || !pin) return;
    F.busy(btn, true);
    try {
      const r = await F.rpc('alfikr_emp_login', { p_code: code, p_pin: pin });
      state.token = r.token;
      F.store.set(TOKEN_KEY, r.token);
      F.store.set('fikr.emp.code', code);
      await loadMe();
      $('#pin').value = '';
      showApp();
      F.vibrate(20);
    } catch (e) {
      const card = $('.auth-card');
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      F.toast(F.errorText(e), 'bad');
      F.vibrate([30, 40, 30]);
    } finally {
      F.busy(btn, false);
    }
  });

  async function logout(silent) {
    if (state.token) F.rpc('alfikr_emp_logout', { p_token: state.token }).catch(() => {});
    F.store.del(TOKEN_KEY);
    state.token = null;
    state.me = null;
    clearTimers();
    showLogin();
    if (silent) F.toast(F.errorText({ code: 'unauthorized' }));
  }

  /* ───────── location ───────── */
  let watchId = null;
  function startGeo() {
    if (!('geolocation' in navigator)) { state.geo = 'unsupported'; return; }
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition(
      (p) => { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; state.geo = 'ok'; updateLoc(); },
      (err) => { state.geo = err.code === 1 ? 'denied' : 'error'; if (err.code === 1) state.pos = null; updateLoc(); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
    );
  }
  function freshPosition() {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(state.pos);
      navigator.geolocation.getCurrentPosition(
        (p) => { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; state.geo = 'ok'; resolve(state.pos); },
        (err) => { state.geo = err.code === 1 ? 'denied' : 'error'; if (err.code === 1) state.pos = null; resolve(state.pos); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
      );
    });
  }
  function geofence() {
    const b = state.me && state.me.branch;
    return b && b.lat != null && b.lng != null ? b : null;
  }
  // Check-in/out is only possible with location ON and inside the workplace radius.
  // The server enforces the same rule; this only explains it to the employee up front.
  const MAX_ACCURACY_M = 150, ACCURACY_ALLOWANCE_M = 25;
  function locInfo() {
    const b = geofence();
    if (!b) return { ok: false, cls: 'bad', text: 'لم يحدد المسؤول موقع مقر عملك بعد' };
    if (state.geo === 'unsupported') return { ok: false, cls: 'bad', text: 'جهازك لا يدعم تحديد الموقع' };
    if (state.geo === 'denied') return { ok: false, cls: 'bad', text: 'الموقع مغلق · فعّله واسمح للمتصفح بالوصول' };
    if (!state.pos) {
      return state.geo === 'error'
        ? { ok: false, cls: 'bad', text: 'تعذّر تحديد موقعك · تأكد أن خدمة الموقع مفعّلة' }
        : { ok: false, cls: 'warn', text: 'جارٍ تحديد موقعك…' };
    }
    const acc = state.pos.acc || 0;
    if (acc > MAX_ACCURACY_M) return { ok: false, cls: 'warn', text: `دقة الموقع ضعيفة (±${Math.round(acc).toLocaleString(F.LOCALE)} م) · فعّل GPS` };
    const d = Math.round(F.distanceM(state.pos.lat, state.pos.lng, b.lat, b.lng));
    const dTxt = d >= 1000 ? `${(d / 1000).toLocaleString(F.LOCALE, { maximumFractionDigits: 1 })} كم` : `${d.toLocaleString(F.LOCALE)} م`;
    if (d <= b.radius_m + Math.min(acc, ACCURACY_ALLOWANCE_M)) return { ok: true, cls: 'ok', text: `داخل ${b.name} · ${dTxt}` };
    return { ok: false, cls: 'bad', text: `خارج مقر العمل · تبعد ${dTxt}` };
  }
  function updateLoc() {
    const el = $('#loc');
    if (!el) return;
    const i = locInfo();
    el.className = 'loc ' + i.cls;
    el.innerHTML = `<span class="dot"></span>${F.esc(i.text)}`;
    const btn = $('#punchBtn');
    if (!btn || btn.classList.contains('loading') || btn.classList.contains('success')) return;
    const ps = punchState();
    if (ps === 'done') return;
    btn.classList.toggle('locked', !i.ok);
    $('.hint', btn).textContent = i.ok
      ? (ps === 'in' ? 'اضغط لتسجيل البصمة' : 'اضغط عند المغادرة')
      : 'متاح فقط داخل مقر العمل';
  }

  /* ───────── render ───────── */
  function clearTimers() { state.timers.forEach(clearInterval); state.timers = []; }
  function now() { return new Date(Date.now() + state.offset); }

  function render() {
    clearTimers();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
    const v = $('#view');
    if (state.tab === 'home') v.innerHTML = homeView();
    else if (state.tab === 'history') v.innerHTML = historyView();
    else v.innerHTML = profileView();
    window.scrollTo({ top: 0 });
    if (state.tab === 'home') mountHome();
    if (state.tab === 'profile') $('#logoutBtn').onclick = () => logout();
    const r = $('#refreshBtn');
    if (r) r.onclick = refresh;
  }

  async function refresh() {
    const r = $('#refreshBtn');
    if (r) r.firstElementChild.style.animation = 'spin .8s linear infinite';
    try { await loadMe(); render(); } catch (e) { if (e.code === 'unauthorized') return logout(true); F.toast(F.errorText(e), 'bad'); }
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    if (state.tab === t.dataset.tab) return;
    state.tab = t.dataset.tab;
    F.vibrate(8);
    render();
  }));

  function greeting() {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: state.me.timezone }).format(now()));
    return h < 12 ? 'صباح الخير' : 'مساء الخير';
  }

  function punchState() {
    const t = state.me.today;
    if (!t || !t.check_in) return 'in';
    if (!t.check_out) return 'out';
    return 'done';
  }

  function homeView() {
    const me = state.me, e = me.employee, t = me.today || {};
    const ps = punchState();
    const lbl = { in: 'تسجيل الحضور', out: 'تسجيل الانصراف', done: 'اكتمل يومك' }[ps];
    const hint = { in: 'اضغط لتسجيل البصمة', out: 'اضغط عند المغادرة', done: 'نراك غداً بإذن الله' }[ps];
    const statusToday = t.check_in ? F.statusPill(t.status) : '<span class="pill mute">لم يسجل بعد</span>';
    return `
    <header class="hero">
      <div class="hero-top">
        <div class="row">
          <div class="avatar">${F.esc(F.initials(e.name))}</div>
          <div>
            <p class="sub">${greeting()} 👋</p>
            <h1>${F.esc(e.name)}</h1>
          </div>
        </div>
        <button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button>
      </div>
    </header>
    <div class="page">
      <div class="card lift">
        <div class="clock">
          <div class="time num" id="clockTime">--:--</div>
          <div class="date" id="clockDate"></div>
          <div class="hijri">${F.esc(F.fmtHijri(me.timezone))}</div>
        </div>
        <div class="punch-zone">
          <button class="punch ${ps}" id="punchBtn" ${ps === 'done' ? 'disabled' : ''}>
            <svg class="orbit" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="70 232" opacity=".9"/></svg>
            <span class="fp-wrap">${ps === 'done' ? F.ICONS.check.replace('<svg', '<svg class="fp"') : F.ICONS.finger.replace('<svg', '<svg class="fp"')}</span>
            <span class="lbl">${lbl}</span>
            <span class="hint">${hint}</span>
          </button>
          <div class="loc" id="loc"></div>
        </div>
      </div>

      <div class="card">
        <div class="stats3">
          <div><div class="k">الحضور</div><div class="v num">${F.fmtTime(t.check_in, me.timezone)}</div></div>
          <div><div class="k">الانصراف</div><div class="v num">${F.fmtTime(t.check_out, me.timezone)}</div></div>
          <div><div class="k">ساعات العمل</div><div class="v num" id="worked">${t.check_in ? '' : '00:00:00'}</div></div>
        </div>
      </div>

      <div class="card">
        <div class="shift-row">
          <div class="ico">${F.ICONS.clock}</div>
          <div style="flex:1">
            <div class="bold">دوام اليوم</div>
            <div class="muted small"><span class="num">${e.shift_start}</span> – <span class="num">${e.shift_end}</span>${e.branch_name ? ' · ' + F.esc(e.branch_name) : ''}</div>
          </div>
          ${statusToday}
        </div>
      </div>

      <div class="section-title"><span>آخر 7 أيام</span></div>
      <div class="card">${weekStrip()}</div>
    </div>`;
  }

  function weekStrip() {
    const tz = state.me.timezone;
    const today = F.todayISO(tz);
    const map = {};
    (state.me.history || []).forEach((h) => { map[h.work_date] = h; });
    let out = '<div class="week">';
    for (let i = 6; i >= 0; i--) {
      const d = F.addDays(today, -i);
      const h = map[d];
      const cls = h ? (h.status === 'late' ? 'warn' : 'ok') : '';
      const day = new Date(d + 'T12:00:00Z').toLocaleDateString(F.LOCALE, { weekday: 'short', timeZone: 'UTC' });
      out += `<div style="animation-delay:${(6 - i) * 50}ms"><div class="d">${day}</div><div class="b ${cls} ${i === 0 ? 'today' : ''}" style="animation-delay:${(6 - i) * 60}ms">${Number(d.slice(8))}</div></div>`;
    }
    return out + '</div><div class="row small muted" style="margin-top:12px;gap:14px;justify-content:center"><span class="pill ok">في الوقت</span><span class="pill warn">متأخر</span></div>';
  }

  function mountHome() {
    const tz = state.me.timezone;
    const tick = () => {
      const n = now();
      const parts = new Intl.DateTimeFormat(F.LOCALE, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: tz }).formatToParts(n);
      const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
      const ct = $('#clockTime');
      if (ct) ct.innerHTML = `${g('hour')}:${g('minute')}<small>${g('dayPeriod')}</small>`;
      const cd = $('#clockDate');
      if (cd && !cd.textContent) cd.textContent = n.toLocaleDateString(F.LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz });
      const t = state.me.today;
      const w = $('#worked');
      if (w && t && t.check_in) {
        const end = t.check_out ? new Date(t.check_out) : n;
        w.textContent = F.fmtClock(end - new Date(t.check_in));
      }
    };
    tick();
    state.timers.push(setInterval(tick, 1000));
    updateLoc();
    $('#punchBtn').addEventListener('click', onPunch);
  }

  async function onPunch() {
    const btn = $('#punchBtn');
    const ps = punchState();
    if (ps === 'done' || btn.classList.contains('loading')) return;
    if (ps === 'out') {
      const ok = await F.confirmSheet('تأكيد الانصراف', 'هل تريد تسجيل انصرافك الآن؟ لا يمكن التراجع بعد التسجيل.', 'تسجيل الانصراف');
      if (!ok) return;
    }
    F.vibrate(15);
    btn.classList.add('loading');
    $('.lbl', btn).textContent = 'جارٍ التحقق…';
    $('.hint', btn).textContent = 'نتحقق من موقعك';
    try {
      if (!geofence()) throw { code: 'no_workplace' };
      const pos = await freshPosition();
      const info = locInfo();
      if (!pos || !info.ok) throw { local: info.text };
      const r = await F.rpc('alfikr_emp_punch', {
        p_token: state.token, p_type: ps, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.acc,
      });
      btn.classList.remove('loading');
      btn.classList.add('success');
      $('.fp-wrap', btn).innerHTML = F.ICONS.check.replace('<svg', '<svg class="ok-check"');
      $('.lbl', btn).textContent = ps === 'in' ? 'تم تسجيل الحضور' : 'تم تسجيل الانصراف';
      $('.hint', btn).textContent = F.fmtTime(ps === 'in' ? r.check_in : r.check_out, state.me.timezone);
      burst(btn);
      F.vibrate([20, 60, 40]);
      F.toast(ps === 'in' ? (r.status === 'late' ? 'تم تسجيل حضورك (متأخر)' : 'تم تسجيل حضورك، يوماً موفقاً ✨') : 'تم تسجيل انصرافك، شكراً لجهودك 🌙', 'ok');
      setTimeout(async () => { try { await loadMe(); } catch (e) {} if (state.tab === 'home') render(); }, 1600);
    } catch (e) {
      btn.classList.remove('loading');
      $('.lbl', btn).textContent = ps === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف';
      $('.hint', btn).textContent = 'حاول مرة أخرى';
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      F.vibrate([40, 50, 40]);
      if (e.code === 'unauthorized') return logout(true);
      F.toast(e.local || F.errorText(e), 'bad');
      updateLoc();
      if (/^already_/.test(e.code || '')) refresh();
    }
  }

  function burst(btn) {
    const colors = ['#2dd4bf', '#d9a13b', '#f5d08a', '#16a34a', '#fb923c'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('span');
      p.className = 'burst';
      p.style.setProperty('--a', (i * 20) + 'deg');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 80) + 'ms';
      btn.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
  }

  function historyView() {
    const me = state.me, tz = me.timezone;
    const hist = me.history || [];
    const late = hist.filter((h) => h.status === 'late').length;
    const totalMs = hist.reduce((s, h) => s + (h.check_in && h.check_out ? new Date(h.check_out) - new Date(h.check_in) : 0), 0);
    const items = hist.map((h, i) => {
      const dur = h.check_in && h.check_out ? F.fmtDuration(new Date(h.check_out) - new Date(h.check_in)) : 'لم ينصرف';
      const d = new Date(h.work_date + 'T12:00:00Z');
      return `<div class="item" style="animation-delay:${Math.min(i, 12) * 40}ms">
        <div class="avatar" style="flex-direction:column;line-height:1.1;font-size:15px">${d.getUTCDate()}<span class="tiny" style="font-size:10px;font-weight:600">${d.toLocaleDateString(F.LOCALE, { month: 'short', timeZone: 'UTC' })}</span></div>
        <div class="meta">
          <div class="t">${F.fmtDate(h.work_date, { month: undefined, day: undefined })}</div>
          <div class="s"><span class="num">${F.fmtTime(h.check_in, tz)}</span> ← <span class="num">${F.fmtTime(h.check_out, tz)}</span> · ${dur}</div>
        </div>
        ${F.statusPill(h.status)}
      </div>`;
    }).join('');
    return `
    <header class="hero"><div class="hero-top"><div><p class="sub">آخر 30 يوماً</p><h1>سجل الحضور</h1></div>
      <button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button></div></header>
    <div class="page">
      <div class="card lift"><div class="stats3">
        <div><div class="k">أيام الحضور</div><div class="v">${hist.length.toLocaleString(F.LOCALE)}</div></div>
        <div><div class="k">مرات التأخير</div><div class="v" style="color:var(--warn)">${late.toLocaleString(F.LOCALE)}</div></div>
        <div><div class="k">إجمالي الساعات</div><div class="v">${Math.round(totalMs / 36e5).toLocaleString(F.LOCALE)}</div></div>
      </div></div>
      <div class="section-title"><span>التفاصيل</span></div>
      ${hist.length ? `<div class="list">${items}</div>` : '<div class="card empty"><div class="ico">🗓️</div>لا توجد سجلات بعد<br><span class="small">ستظهر هنا بصمات الحضور والانصراف</span></div>'}
    </div>`;
  }

  function profileView() {
    const me = state.me, e = me.employee;
    const kv = (k, v) => (v ? `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>` : '');
    return `
    <header class="hero profile-head">
      <div class="avatar lg">${F.esc(F.initials(e.name))}</div>
      <h1>${F.esc(e.name)}</h1>
      <p class="sub">${F.esc(e.job_title || 'موظف')}${e.department ? ' · ' + F.esc(e.department) : ''}</p>
    </header>
    <div class="page">
      <div class="card lift">
        ${kv('الرقم الوظيفي', `<span class="num">${F.esc(e.code)}</span>`)}
        ${kv('الجهة', F.esc(me.company))}
        ${kv('الفرع', F.esc(e.branch_name))}
        ${kv('القسم', F.esc(e.department))}
        ${kv('الجوال', e.phone ? `<span class="num">${F.esc(e.phone)}</span>` : '')}
        ${kv('وقت الدوام', `<span class="num">${e.shift_start} – ${e.shift_end}</span>`)}
        ${kv('مهلة التأخير', `${me.grace_minutes} دقيقة`)}
      </div>
      <div class="card">
        <div class="row"><div style="flex:1"><div class="bold">أضف التطبيق للشاشة الرئيسية</div>
        <div class="muted small">من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» للوصول السريع</div></div><img src="assets/logo.svg" width="40" height="40" alt=""></div>
      </div>
      <button class="btn soft-danger block" id="logoutBtn" style="margin-top:16px">${F.ICONS.logout.replace('<svg', '<svg width="20" height="20"')} تسجيل الخروج</button>
      <p class="center tiny muted" style="margin-top:18px">الفكر السعد · نظام الحضور والانصراف</p>
    </div>`;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.token && state.me) refresh();
  });

  boot();
})();
