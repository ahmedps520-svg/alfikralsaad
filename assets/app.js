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
    const saved = F.store.get('fikr.emp.phone');
    if (saved) { $('#phone').value = saved; }
    setTimeout(() => (saved ? $('#pin') : $('#phone')).focus(), 400);
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
    const phone = $('#phone').value.trim();
    const pin = $('#pin').value.trim();
    if (!phone || !pin) return;
    F.busy(btn, true);
    try {
      const r = await F.rpc('alfikr_emp_login', { p_phone: phone, p_pin: pin });
      state.token = r.token;
      F.store.set(TOKEN_KEY, r.token);
      F.store.set('fikr.emp.phone', phone);
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
      (p) => { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; state.geo = 'ok'; updateLoc(); },
      (err) => { state.geo = err.code === 1 ? 'denied' : 'error'; if (err.code === 1) state.pos = null; updateLoc(); },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
    );
  }
  // Uses the live (watched) position when it is recent; otherwise asks the device for a new fix.
  function freshPosition() {
    return new Promise((resolve) => {
      if (state.pos && state.geo === 'ok' && Date.now() - state.pos.at < 30e3) return resolve(state.pos);
      if (!('geolocation' in navigator)) return resolve(state.pos);
      navigator.geolocation.getCurrentPosition(
        (p) => { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: Date.now() }; state.geo = 'ok'; resolve(state.pos); },
        (err) => { state.geo = err.code === 1 ? 'denied' : 'error'; if (err.code === 1) state.pos = null; resolve(state.pos); },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    });
  }
  // Check-in/out needs location ON (the position is logged with the selfie). Employees can be anywhere.
  function locInfo() {
    if (state.geo === 'unsupported') return { ok: false, cls: 'bad', text: 'جهازك لا يدعم تحديد الموقع' };
    if (state.geo === 'denied') return { ok: false, cls: 'bad', text: 'الموقع مغلق · فعّله واسمح للمتصفح بالوصول' };
    if (!state.pos) {
      return state.geo === 'error'
        ? { ok: false, cls: 'bad', text: 'تعذّر تحديد موقعك · تأكد أن خدمة الموقع مفعّلة' }
        : { ok: false, cls: 'warn', text: 'جارٍ تحديد موقعك…' };
    }
    const acc = Math.round(state.pos.acc || 0);
    return { ok: true, cls: 'ok', text: `الموقع مفعّل · الدقة ±${acc.toLocaleString(F.LOCALE)} م` };
  }
  function updateLoc() {
    const el = $('#loc');
    if (!el) return;
    const i = locInfo();
    el.className = 'loc ' + i.cls;
    el.innerHTML = `<span class="dot"></span>${F.esc(i.text)}`;
    const btn = $('#punchBtn');
    if (!btn || btn.classList.contains('loading') || btn.classList.contains('success')) return;
    btn.classList.toggle('locked', !i.ok);
    $('.hint', btn).textContent = i.ok ? 'سيلفي + موقعك الحالي' : 'شغّل الموقع أولاً';
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

  // Next print: 'in' (check in / back at work) or 'out' (leave work). Several pairs per day are allowed.
  function punchState() {
    const t = state.me.today;
    return t && t.last_in ? 'out' : 'in';
  }
  // Minutes worked today, counting the current open period.
  function workedMs(t, n) {
    if (!t) return 0;
    return Number(t.worked_minutes || 0) * 60000 + (t.last_in ? Math.max(0, n - new Date(t.last_in)) : 0);
  }

  function homeView() {
    const me = state.me, e = me.employee, t = me.today || {};
    const ps = punchState();
    const lbl = ps === 'out' ? 'تسجيل الانصراف' : (t.check_in ? 'تسجيل حضور جديد' : 'تسجيل الحضور');
    const hint = 'سيلفي + موقعك الحالي';
    const prints = me.today_punches || [];
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
        <div class="row" style="gap:8px">${F.langSwitch('glass')}<button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button></div>
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
          <button class="punch ${ps}" id="punchBtn">
            <svg class="orbit" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="70 232" opacity=".9"/></svg>
            <span class="fp-wrap">${F.ICONS.finger.replace('<svg', '<svg class="fp"')}</span>
            <span class="lbl">${lbl}</span>
            <span class="hint">${hint}</span>
          </button>
          <div class="loc" id="loc"></div>
        </div>
      </div>

      <div class="card">
        <div class="stats3">
          <div><div class="k">الحضور</div><div class="v num">${F.fmtTime(t.check_in, me.timezone)}</div></div>
          <div><div class="k">الانصراف</div><div class="v num">${t.last_in ? '—' : F.fmtTime(t.check_out, me.timezone)}</div></div>
          <div><div class="k">ساعات العمل</div><div class="v num" id="worked">${t.check_in ? '' : '00:00:00'}</div></div>
        </div>
      </div>

      <div class="card">
        <div class="shift-row">
          <div class="ico">${F.ICONS.clock}</div>
          <div style="flex:1">
            <div class="bold">دوام اليوم</div>
            <div class="muted small"><span class="num">${e.shift_start}</span> – <span class="num">${e.shift_end}</span>${t.in_site ? ' · ' + F.esc(t.in_site) : ''}</div>
          </div>
          ${statusToday}
        </div>
      </div>

      ${prints.length ? `<div class="section-title"><span>بصمات اليوم</span><span class="tiny muted">${prints.length}</span></div>
      <div class="card"><div class="timeline">${prints.map((p, i) => `<div class="tl ${p.type}" style="animation-delay:${i * 60}ms">
        <span class="tl-dot"></span><div class="tl-body"><b>${p.type === 'in' ? 'حضور' : 'انصراف'}</b>
        <span class="num">${F.fmtTime(p.at, me.timezone)}</span>${p.site ? `<div class="tiny muted">📍 ${F.esc(p.site)}</div>` : ''}</div></div>`).join('')}</div></div>` : ''}

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
      if (w && t && t.check_in) w.textContent = F.fmtClock(workedMs(t, n));
    };
    tick();
    state.timers.push(setInterval(tick, 1000));
    updateLoc();
    $('#punchBtn').addEventListener('click', onPunch);
  }

  async function onPunch() {
    const btn = $('#punchBtn');
    const ps = punchState();
    if (btn.classList.contains('loading')) return;
    F.vibrate(10);
    // 1) location must be on
    let pos = state.pos;
    if (!pos || state.geo !== 'ok') {
      $('.hint', btn).textContent = 'نحدد موقعك…';
      pos = await freshPosition();
      updateLoc();
      if (!pos || state.geo !== 'ok') return F.toast(locInfo().text, 'bad');
    }
    // 2) live selfie (+ optional site name)
    const shot = await selfieSheet(ps);
    if (!shot) return;
    // 3) submit with a fresh position
    btn.classList.add('loading');
    $('.lbl', btn).textContent = 'جارٍ التسجيل…';
    $('.hint', btn).textContent = 'نرفع الصورة والموقع';
    try {
      pos = (await freshPosition()) || pos;
      if (!pos) throw { code: 'location_required' };
      const r = await F.rpc('alfikr_emp_punch', {
        p_token: state.token, p_type: ps, p_lat: pos.lat, p_lng: pos.lng, p_accuracy: pos.acc,
        p_site: shot.site, p_photo: shot.photo,
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
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      F.vibrate([40, 50, 40]);
      if (e.code === 'unauthorized') return logout(true);
      F.toast(F.errorText(e), 'bad');
      updateLoc();
      if (/^already_|^not_checked/.test(e.code || '')) refresh();
    }
  }

  /* ───────── selfie camera ───────── */
  // Opens the front camera inside the app (no gallery). Resolves { photo, site } or null.
  function selfieSheet(ps) {
    return new Promise((resolve) => {
      let stream = null, done = false, photo = null;
      const recent = (state.me.recent_sites || []);
      const lastSite = (state.me.today && state.me.today.in_site) || recent[0] || '';
      const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
      F.sheet(`
        <h3>${ps === 'in' ? 'تسجيل الحضور' : 'تسجيل الانصراف'}</h3>
        <p class="muted small" style="margin:-8px 0 14px">التقط صورة سيلفي الآن لإثبات تواجدك، وسيُحفظ موقعك الحالي معها</p>
        <div class="cam"><video id="camVideo" playsinline autoplay muted></video><img id="camShot" alt="" hidden>
          <div class="cam-ring"></div><div class="cam-msg" id="camMsg">جارٍ تشغيل الكاميرا…</div></div>
        <label class="field" style="margin-top:16px"><span>مكان العمل اليوم (اختياري)</span>
          <input class="input" id="camSite" list="siteList" maxlength="80" placeholder="مثال: مشروع حي النرجس" value="${F.esc(lastSite)}">
          <datalist id="siteList">${recent.map((x) => `<option value="${F.esc(x)}">`).join('')}</datalist></label>
        <input type="file" id="camFile" accept="image/*" capture="user" hidden>
        <div id="camActions"><button class="btn block" id="camSnap" disabled>${F.ICONS.camera} التقط الصورة</button></div>
        <button class="btn ghost block" data-close style="margin-top:10px">إلغاء</button>`,
      (el, close) => {
        const video = $('#camVideo', el), img = $('#camShot', el), msg = $('#camMsg', el), actions = $('#camActions', el);
        const snapBtn = () => $('#camSnap', el);
        const setShot = (dataUrl) => {
          photo = dataUrl;
          img.src = dataUrl; img.hidden = false; video.hidden = true; msg.hidden = true;
          stop();
          actions.innerHTML = `<div class="grid-2"><button class="btn ghost" id="camRetake">إعادة التصوير</button>
            <button class="btn" id="camOk">${F.ICONS.check} تأكيد ${ps === 'in' ? 'الحضور' : 'الانصراف'}</button></div>`;
          $('#camRetake', el).onclick = () => { photo = null; img.hidden = true; video.hidden = false; actions.innerHTML = `<button class="btn block" id="camSnap">${F.ICONS.camera} التقط الصورة</button>`; startCam(); };
          $('#camOk', el).onclick = () => { done = true; const site = $('#camSite', el).value.trim(); close(); resolve({ photo, site }); };
        };
        const useFileFallback = () => {
          msg.textContent = 'اضغط لفتح الكاميرا';
          actions.innerHTML = `<button class="btn block" id="camSnap">${F.ICONS.camera} فتح الكاميرا</button>`;
          snapBtn().onclick = () => $('#camFile', el).click();
          $('#camFile', el).onchange = async (ev) => {
            const f = ev.target.files && ev.target.files[0];
            if (!f) return;
            if (Date.now() - f.lastModified > 3 * 60e3) return F.toast('التقط صورة جديدة الآن، لا يمكن استخدام صورة قديمة', 'bad');
            const bmp = await loadImage(URL.createObjectURL(f));
            setShot(stamp(bmp, bmp.naturalWidth || bmp.width, bmp.naturalHeight || bmp.height, false));
          };
        };
        async function startCam() {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return useFileFallback();
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
            if (done) return stop();
            video.srcObject = stream;
            await video.play().catch(() => {});
            msg.hidden = true;
            const b = snapBtn(); b.disabled = false;
            b.onclick = () => { if (!video.videoWidth) return; F.vibrate(15); setShot(stamp(video, video.videoWidth, video.videoHeight, true)); };
          } catch (err) {
            if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
              msg.textContent = F.errorText({ code: 'camera_denied' });
              F.toast(F.errorText({ code: 'camera_denied' }), 'bad');
            } else useFileFallback();
          }
        }
        startCam();
      }, () => { stop(); if (!done) resolve(null); });
    });
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  // Crops to a square, draws the selfie (mirrored like the preview), and stamps the time and position on it.
  function stamp(source, w, h, mirror) {
    const size = 540, side = Math.min(w, h);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    x.save();
    if (mirror) { x.translate(size, 0); x.scale(-1, 1); }
    x.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    x.restore();
    const g = x.createLinearGradient(0, size - 90, 0, size);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.65)');
    x.fillStyle = g; x.fillRect(0, size - 90, size, 90);
    x.fillStyle = '#fff'; x.font = '600 18px system-ui, sans-serif'; x.textBaseline = 'bottom'; x.textAlign = 'center';
    const n = now();
    const when = n.toLocaleString('en-GB', { timeZone: state.me.timezone, dateStyle: 'medium', timeStyle: 'short' });
    x.fillText(when, size / 2, size - 44);
    if (state.pos) x.fillText(`${state.pos.lat.toFixed(5)}, ${state.pos.lng.toFixed(5)}  ±${Math.round(state.pos.acc || 0)}m`, size / 2, size - 20);
    return c.toDataURL('image/jpeg', 0.78);
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
    const n = now();
    const totalMs = hist.reduce((s, h) => s + workedMs(h, n), 0);
    const items = hist.map((h, i) => {
      const dur = h.last_in ? 'لم ينصرف' : F.fmtDuration(workedMs(h, n));
      const d = new Date(h.work_date + 'T12:00:00Z');
      return `<div class="item" style="animation-delay:${Math.min(i, 12) * 40}ms">
        <div class="avatar" style="flex-direction:column;line-height:1.1;font-size:15px">${d.getUTCDate()}<span class="tiny" style="font-size:10px;font-weight:600">${d.toLocaleDateString(F.LOCALE, { month: 'short', timeZone: 'UTC' })}</span></div>
        <div class="meta">
          <div class="t">${F.fmtDate(h.work_date, { month: undefined, day: undefined })}</div>
          <div class="s"><span class="num">${F.fmtTime(h.check_in, tz)}</span> ← <span class="num">${h.last_in ? '—' : F.fmtTime(h.check_out, tz)}</span> · ${dur}${h.in_site ? ' · ' + F.esc(h.in_site) : ''}</div>
        </div>
        ${F.statusPill(h.status)}
      </div>`;
    }).join('');
    return `
    <header class="hero"><div class="hero-top"><div><p class="sub">آخر 30 يوماً</p><h1>سجل الحضور</h1></div>
      <div class="row" style="gap:8px">${F.langSwitch('glass')}<button class="icon-btn" id="refreshBtn" aria-label="تحديث">${F.ICONS.refresh}</button></div></div></header>
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
        ${kv('الجوال', e.phone ? `<span class="num">${F.esc(e.phone)}</span>` : '')}
        ${kv('الرقم الوظيفي', `<span class="num">${F.esc(e.code)}</span>`)}
        ${kv('الجهة', F.esc(me.company))}
        ${kv('القسم', F.esc(e.department))}
        ${kv('وقت الدوام', `<span class="num">${e.shift_start} – ${e.shift_end}</span>`)}
        ${kv('مهلة التأخير', `${me.grace_minutes} دقيقة`)}
      </div>
      <div class="card">
        <div class="row between"><div><div class="bold">اللغة</div><div class="muted small">اختر لغة التطبيق</div></div>${F.langSwitch('lg')}</div>
      </div>
      <div class="card">
        <div class="row"><div style="flex:1"><div class="bold">أضف التطبيق للشاشة الرئيسية</div>
        <div class="muted small">من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية» للوصول السريع</div></div><img src="assets/logo.svg" width="40" height="40" alt=""></div>
      </div>
      <button class="btn soft-danger block" id="logoutBtn" style="margin-top:16px">${F.ICONS.logout.replace('<svg', '<svg width="20" height="20"')} تسجيل الخروج</button>
      <p class="center tiny muted" style="margin-top:18px">الفكر السعد · نظام الحضور والانصراف</p>
    </div>`;
  }

  // Re-draw the current screen in the newly chosen language.
  window.addEventListener('fikr:lang', () => { if (state.me && !$('#app').classList.contains('hidden')) render(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.token && state.me) refresh();
  });

  boot();
})();
