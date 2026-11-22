// الفكر السعد — ForgeBase edge function `api`
// The website calls POST /functions/v1/api with { action, ...args }.
// Tables are locked with row-level security (no policies), so this function is the
// only way in. Employees sign in with phone number + PIN. Every check-in/out must carry
// a live selfie (stored in the private `selfies` bucket) and the phone's GPS position,
// so the admin can see who checked in, where, and when. Employees can work anywhere.

const PBKDF2_ITER = 120000;
const MAX_PHOTO_BYTES = 600 * 1024;
const enc = new TextEncoder();

class Fail extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}

/* ───────── helpers ───────── */
const b64 = (buf) => Buffer.from(buf).toString('base64');
const hex = (buf) => Buffer.from(buf).toString('hex');

async function pbkdf2(secret, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
async function hashSecret(secret) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(await pbkdf2(secret, salt, PBKDF2_ITER))}`;
}
async function verifySecret(secret, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [kind, iter, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2') return false;
  const got = Buffer.from(await pbkdf2(secret, Buffer.from(salt, 'base64'), Number(iter)));
  const want = Buffer.from(hash, 'base64');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const addMs = (ms) => new Date(Date.now() + ms).toISOString();
const q = (v) => encodeURIComponent(v);

function localParts(tz, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(hour) * 60 + Number(p.minute) };
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const hmToMin = (hm) => { const [h, m] = String(hm || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
const validHm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.slice(0, 5));
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v, max = 120) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);
// Phone numbers match on their last 9 digits, so 0501234567, +966501234567 and 966501234567 are the same.
function phoneKey(v) {
  const digits = String(v || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/* ───────── database (REST with the service key) ───────── */
function makeDb(ctx) {
  const key = ctx.env.FORGEBASE_SERVICE_ROLE_KEY;
  const base = `${ctx.env.FORGEBASE_URL}/rest/v1/`;
  async function req(method, path, body, prefer) {
    const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    if (prefer) headers.prefer = prefer;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      console.error('db error', method, path.split('?')[0], res.status, typeof data === 'string' ? data : JSON.stringify(data));
      if (res.status === 409 || /unique/i.test(JSON.stringify(data))) throw new Fail('conflict', 409);
      throw new Fail('server_error', 500);
    }
    return data;
  }
  return {
    select: (t, query = '') => req('GET', `${t}?${query}`),
    one: async (t, query) => ((await req('GET', `${t}?${query}&limit=1`)) || [])[0] || null,
    insert: async (t, row) => { const r = await req('POST', t, row, 'return=representation'); return Array.isArray(r) ? r[0] : r; },
    update: (t, query, patch) => req('PATCH', `${t}?${query}`, patch, 'return=representation'),
    remove: (t, query) => req('DELETE', `${t}?${query}`),
    async upload(bucket, path, bytes, type) {
      const res = await fetch(`${ctx.env.FORGEBASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': type, 'x-upsert': 'true' }, body: bytes,
      });
      if (!res.ok) { console.error('upload failed', res.status, await res.text()); throw new Fail('photo_upload_failed', 500); }
    },
    async signed(bucket, path, expiresIn = 3600) {
      if (!path) return null;
      const res = await fetch(`${ctx.env.FORGEBASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
        method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ expiresIn }),
      });
      if (!res.ok) { console.error('sign failed', res.status, await res.text()); return null; }
      const d = await res.json();
      const u = d.signedURL || d.signedUrl;
      if (!u) return null;
      return /^https?:/.test(u) ? u : `${ctx.env.FORGEBASE_URL}/storage/v1${u.startsWith('/') ? '' : '/'}${u}`;
    },
    removeFiles(bucket, paths) {
      if (!paths.length) return Promise.resolve();
      return fetch(`${ctx.env.FORGEBASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: paths }),
      }).catch(() => {});
    },
  };
}

// Decodes the selfie the app sends (data URL or base64 JPEG/WebP) and checks it is a real image.
function decodePhoto(v) {
  if (typeof v !== 'string' || v.length < 100) throw new Fail('photo_required');
  const m = /^data:(image\/(?:jpeg|webp));base64,(.+)$/.exec(v);
  const type = m ? m[1] : 'image/jpeg';
  const bytes = Buffer.from(m ? m[2] : v, 'base64');
  if (bytes.length < 2000 || bytes.length > MAX_PHOTO_BYTES) throw new Fail('photo_required');
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isWebp = bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isWebp) throw new Fail('photo_required');
  return { bytes, type: isWebp ? 'image/webp' : 'image/jpeg', ext: isWebp ? 'webp' : 'jpg' };
}

// Settings rarely change, so each running instance keeps them for 30 seconds.
let settingsCache = null;
async function settings(db, fresh = false) {
  if (!fresh && settingsCache && Date.now() - settingsCache.t < 30e3) return settingsCache.v;
  const v = (await db.one('settings', 'id=eq.1&select=*')) || { company_name: 'الفكر السعد', timezone: 'Asia/Riyadh', grace_minutes: 15 };
  settingsCache = { v, t: Date.now() };
  return v;
}

async function checkRate(db, ident, max, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const rows = await db.select('login_attempts', `select=id&ident=eq.${q(ident)}&at=gte.${q(since)}`);
  if ((rows || []).length >= max) throw new Fail('too_many_attempts', 429);
}
const recordFail = (db, ident) => db.insert('login_attempts', { ident, at: nowIso() });
const clearFails = (db, ident) => db.remove('login_attempts', `ident=eq.${q(ident)}`);

async function newSession(db, kind, employeeId, ttlMs) {
  const token = newToken();
  await db.remove('sessions', `expires_at=lt.${q(nowIso())}`);
  await db.insert('sessions', { token_hash: await sha256(token), kind, employee_id: employeeId, expires_at: addMs(ttlMs) });
  return token;
}
async function session(db, token, kind) {
  if (!token || typeof token !== 'string' || token.length > 100) throw new Fail('unauthorized', 401);
  const s = await db.one('sessions', `token_hash=eq.${await sha256(token)}&kind=eq.${kind}&select=*`);
  if (!s || s.expires_at < nowIso()) throw new Fail('unauthorized', 401);
  return s;
}
async function requireEmployee(db, token) {
  const s = await session(db, token, 'employee');
  const e = await db.one('employees', `id=eq.${q(s.employee_id)}&select=*`);
  if (!e || !Number(e.active)) throw new Fail('unauthorized', 401);
  return e;
}
const requireAdmin = (db, token) => session(db, token, 'admin');

function empOut(e) {
  return {
    id: e.id, code: e.code, name: e.name, phone: e.phone, job_title: e.job_title, department: e.department,
    shift_start: e.shift_start, shift_end: e.shift_end, active: !!Number(e.active),
  };
}

// One attendance record for the admin, with short-lived signed URLs for its selfies.
async function recordOut(db, r, withPhotos = true) {
  const [inUrl, outUrl] = withPhotos ? await Promise.all([db.signed('selfies', r.in_photo), db.signed('selfies', r.out_photo)]) : [null, null];
  return {
    attendance_id: r.id, check_in: r.check_in, check_out: r.check_out,
    in_lat: r.in_lat, in_lng: r.in_lng, in_accuracy: r.in_accuracy, in_site: r.in_site, in_photo_url: inUrl,
    out_lat: r.out_lat, out_lng: r.out_lng, out_accuracy: r.out_accuracy, out_site: r.out_site, out_photo_url: outUrl,
  };
}

/* ───────── employee actions ───────── */
const actions = {
  async emp_login(db, a) {
    const key = phoneKey(a.p_phone);
    const ident = 'emp:' + (key || 'invalid');
    await checkRate(db, ident, 6, 10 * 60e3);
    const e = key ? await db.one('employees', `phone_key=eq.${q(key)}&select=*`) : null;
    if (!e || !Number(e.active) || !(await verifySecret(String(a.p_pin || ''), e.pin_hash))) {
      await recordFail(db, ident);
      throw new Fail('invalid_login', 401);
    }
    await clearFails(db, ident);
    return { token: await newSession(db, 'employee', e.id, 60 * 86400e3) };
  },

  async emp_logout(db, a) {
    if (a.p_token) await db.remove('sessions', `token_hash=eq.${await sha256(String(a.p_token))}`);
    return { ok: true };
  },

  async emp_me(db, a) {
    const [e, s] = await Promise.all([requireEmployee(db, a.p_token), settings(db)]);
    const today = localParts(s.timezone).date;
    const hist = await db.select('attendance',
      `employee_id=eq.${q(e.id)}&work_date=gt.${addDays(today, -31)}&select=work_date,check_in,check_out,status,in_site,out_site&order=work_date.desc`);
    const sites = [];
    hist.forEach((h) => [h.in_site, h.out_site].forEach((x) => { if (x && !sites.includes(x) && sites.length < 6) sites.push(x); }));
    return {
      employee: empOut(e),
      company: s.company_name, timezone: s.timezone, grace_minutes: Number(s.grace_minutes),
      server_now: nowIso(),
      today: hist.find((h) => h.work_date === today) || null,
      history: hist,
      recent_sites: sites,
    };
  },

  // Check-in / check-out: needs a live selfie AND the phone's GPS position (location must be on).
  // Employees can be at any site; the position, accuracy and site name are logged for the admin.
  async emp_punch(db, a) {
    const [e, s] = await Promise.all([requireEmployee(db, a.p_token), settings(db)]);
    const type = a.p_type;
    if (type !== 'in' && type !== 'out') throw new Fail('bad_type');
    const lat = num(a.p_lat), lng = num(a.p_lng), acc = num(a.p_accuracy);
    if (lat === null || lng === null || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Fail('location_required');
    }
    const photo = decodePhoto(a.p_photo);
    const site = str(a.p_site, 80);

    const local = localParts(s.timezone);
    const rec = await db.one('attendance', `employee_id=eq.${q(e.id)}&work_date=eq.${local.date}&select=*`);
    if (type === 'in' && rec && rec.check_in) throw new Fail('already_checked_in');
    if (type === 'out' && (!rec || !rec.check_in)) throw new Fail('not_checked_in');
    if (type === 'out' && rec.check_out) throw new Fail('already_checked_out');

    const path = `${e.id}/${local.date}-${type}-${hex(crypto.getRandomValues(new Uint8Array(4)))}.${photo.ext}`;
    const accuracy = acc !== null && isFinite(acc) ? Math.round(acc) : null;
    // The photo upload and the record write run in parallel; a failed upload undoes the record.
    const upload = db.upload('selfies', path, photo.bytes, photo.type);

    if (type === 'in') {
      const status = local.minutes > hmToMin(e.shift_start) + Number(s.grace_minutes) ? 'late' : 'present';
      const id = uuid();
      const write = db.insert('attendance', {
        id, employee_id: e.id, work_date: local.date, check_in: nowIso(),
        in_lat: lat, in_lng: lng, in_accuracy: accuracy, in_site: site, in_photo: path, status,
      }).catch((err) => { if (err.status === 409) throw new Fail('already_checked_in'); throw err; });
      const [up, wr] = await Promise.allSettled([upload, write]);
      if (wr.status === 'rejected') { if (up.status === 'fulfilled') db.removeFiles('selfies', [path]); throw wr.reason; }
      if (up.status === 'rejected') { await db.remove('attendance', `id=eq.${q(id)}`); throw up.reason; }
      return { ok: true, status: wr.value.status, check_in: wr.value.check_in, check_out: null };
    }
    const write = db.update('attendance', `id=eq.${q(rec.id)}`, {
      check_out: nowIso(), out_lat: lat, out_lng: lng, out_accuracy: accuracy, out_site: site, out_photo: path,
    });
    const [up, wr] = await Promise.allSettled([upload, write]);
    if (wr.status === 'rejected') { if (up.status === 'fulfilled') db.removeFiles('selfies', [path]); throw wr.reason; }
    if (up.status === 'rejected') {
      await db.update('attendance', `id=eq.${q(rec.id)}`, { check_out: null, out_lat: null, out_lng: null, out_accuracy: null, out_site: null, out_photo: null });
      throw up.reason;
    }
    const row = wr.value[0];
    return { ok: true, status: row.status, check_in: row.check_in, check_out: row.check_out };
  },

  /* ───────── admin actions ───────── */
  async admin_login(db, a) {
    await checkRate(db, 'admin', 8, 15 * 60e3);
    const s = await settings(db, true);
    if (!(await verifySecret(String(a.p_password || ''), s.admin_pass_hash))) {
      await recordFail(db, 'admin');
      throw new Fail('invalid_login', 401);
    }
    await clearFails(db, 'admin');
    return { token: await newSession(db, 'admin', null, 7 * 86400e3) };
  },

  async admin_logout(db, a) {
    if (a.p_token) await db.remove('sessions', `token_hash=eq.${await sha256(String(a.p_token))}&kind=eq.admin`);
    return { ok: true };
  },

  async admin_overview(db, a) {
    const [, s] = await Promise.all([requireAdmin(db, a.p_token), settings(db)]);
    const today = localParts(s.timezone).date;
    const date = validDate(a.p_date) ? a.p_date : today;
    const [emps, att] = await Promise.all([
      db.select('employees', 'active=eq.1&select=*'),
      db.select('attendance', `work_date=gte.${addDays(date, -6)}&work_date=lte.${date}&select=*`),
    ]);
    const active = new Set(emps.map((e) => e.id));
    const rows = await Promise.all(emps.map(async (e) => {
      const r = att.find((x) => x.employee_id === e.id && x.work_date === date);
      return {
        id: e.id, code: e.code, name: e.name, phone: e.phone, department: e.department, job_title: e.job_title,
        shift_start: e.shift_start, shift_end: e.shift_end, status: r ? r.status : 'absent',
        ...(r ? await recordOut(db, r) : { attendance_id: null, check_in: null, check_out: null }),
      };
    }));
    rows.sort((x, y) => (x.check_in && y.check_in ? x.check_in.localeCompare(y.check_in) : x.check_in ? -1 : y.check_in ? 1 : x.name.localeCompare(y.name, 'ar')));
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(date, -i);
      const day = att.filter((x) => x.work_date === d && active.has(x.employee_id));
      week.push({ d, on_time: day.filter((x) => x.status === 'present').length, late: day.filter((x) => x.status === 'late').length });
    }
    return { date, today, company: s.company_name, timezone: s.timezone, rows, week };
  },

  async admin_list(db, a) {
    // Data is fetched alongside the session check, but nothing is returned unless the check passes.
    const [, emps, s] = await Promise.all([requireAdmin(db, a.p_token), db.select('employees', 'select=*&order=created_at.asc'), settings(db)]);
    return {
      employees: emps.map(empOut),
      settings: { company_name: s.company_name, timezone: s.timezone, grace_minutes: Number(s.grace_minutes) },
    };
  },

  async admin_save_employee(db, a) {
    await requireAdmin(db, a.p_token);
    const p = a.p || {};
    const id = str(p.id, 64);
    const name = str(p.name), phone = str(p.phone, 30), key = phoneKey(p.phone);
    if (!name) throw new Fail('missing_fields');
    if (!key) throw new Fail('bad_phone');
    const pin = str(p.pin, 20);
    if (pin !== null && !/^\d{4,8}$/.test(pin)) throw new Fail('bad_pin');
    if (!id && pin === null) throw new Fail('bad_pin');
    const dupPhone = await db.one('employees', `phone_key=eq.${q(key)}&select=id`);
    if (dupPhone && dupPhone.id !== id) throw new Fail('duplicate_phone');
    let code = str(p.code, 40);
    if (!code) {
      const all = await db.select('employees', 'select=code');
      code = String(Math.max(1000, ...all.map((x) => Number(x.code) || 0)) + 1);
    }
    const dup = await db.one('employees', `code=eq.${q(code)}&select=id`);
    if (dup && dup.id !== id) throw new Fail('duplicate_code');
    const row = {
      code, name, phone, phone_key: key, job_title: str(p.job_title), department: str(p.department),
      shift_start: validHm(p.shift_start) ? p.shift_start.slice(0, 5) : '08:00',
      shift_end: validHm(p.shift_end) ? p.shift_end.slice(0, 5) : '16:00',
      active: p.active === false || p.active === 'false' ? 0 : 1,
    };
    if (pin !== null) row.pin_hash = await hashSecret(pin);
    let saved;
    if (!id) {
      saved = await db.insert('employees', { id: uuid(), created_at: nowIso(), ...row });
    } else {
      [saved] = await db.update('employees', `id=eq.${q(id)}`, row);
      if (!saved) throw new Fail('not_found', 404);
      if (pin !== null || !row.active) await db.remove('sessions', `employee_id=eq.${q(id)}`);
    }
    return empOut(saved);
  },

  async admin_delete_employee(db, a) {
    await requireAdmin(db, a.p_token);
    const id = str(a.p_id, 64);
    if (!id) throw new Fail('missing_fields');
    const recs = await db.select('attendance', `employee_id=eq.${q(id)}&select=in_photo,out_photo`);
    await db.removeFiles('selfies', recs.flatMap((r) => [r.in_photo, r.out_photo]).filter(Boolean));
    await db.remove('sessions', `employee_id=eq.${q(id)}`);
    await db.remove('attendance', `employee_id=eq.${q(id)}`);
    await db.remove('employees', `id=eq.${q(id)}`);
    return { ok: true };
  },

  async admin_attendance(db, a) {
    await requireAdmin(db, a.p_token);
    if (!validDate(a.p_from) || !validDate(a.p_to)) throw new Fail('missing_fields');
    let query = `work_date=gte.${a.p_from}&work_date=lte.${a.p_to}&select=*&order=work_date.desc,check_in.asc`;
    if (a.p_employee) query += `&employee_id=eq.${q(String(a.p_employee))}`;
    const [att, emps] = await Promise.all([db.select('attendance', query), db.select('employees', 'select=id,code,name,phone,department')]);
    return Promise.all(att.map(async (r) => {
      const e = emps.find((x) => x.id === r.employee_id) || {};
      return { ...(await recordOut(db, r, !!a.p_photos)), id: r.id, work_date: r.work_date, status: r.status,
        employee_id: r.employee_id, code: e.code, name: e.name || '—', phone: e.phone, department: e.department };
    }));
  },

  async admin_delete_attendance(db, a) {
    await requireAdmin(db, a.p_token);
    const id = str(a.p_id, 64);
    if (!id) throw new Fail('missing_fields');
    const r = await db.one('attendance', `id=eq.${q(id)}&select=in_photo,out_photo`);
    if (r) await db.removeFiles('selfies', [r.in_photo, r.out_photo].filter(Boolean));
    await db.remove('attendance', `id=eq.${q(id)}`);
    return { ok: true };
  },

  async admin_save_settings(db, a) {
    const s = await requireAdmin(db, a.p_token);
    const p = a.p || {};
    const patch = {};
    if (str(p.company_name)) patch.company_name = str(p.company_name);
    if (str(p.timezone, 60)) {
      try { new Intl.DateTimeFormat('en', { timeZone: p.timezone }); } catch { throw new Fail('bad_timezone'); }
      patch.timezone = p.timezone;
    }
    if (p.grace_minutes !== undefined && p.grace_minutes !== '') {
      const g = Math.round(Number(p.grace_minutes));
      if (!isFinite(g) || g < 0 || g > 240) throw new Fail('missing_fields');
      patch.grace_minutes = g;
    }
    if (p.new_password) {
      if (String(p.new_password).length < 6) throw new Fail('weak_password');
      patch.admin_pass_hash = await hashSecret(String(p.new_password));
    }
    if (Object.keys(patch).length) await db.update('settings', 'id=eq.1', patch);
    settingsCache = null;
    if (patch.admin_pass_hash) await db.remove('sessions', `kind=eq.admin&token_hash=neq.${s.token_hash}`);
    return { ok: true };
  },
};

/* ───────── entry ───────── */
export default async function handler(req, ctx) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return Response.json({ message: 'method_not_allowed' }, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ message: 'bad_request' }, { status: 400 }); }
  const fn = actions[String(body && body.action).replace(/^alfikr_/, '')];
  if (!fn || !Object.prototype.hasOwnProperty.call(actions, String(body.action).replace(/^alfikr_/, ''))) {
    return Response.json({ message: 'unknown_action' }, { status: 400 });
  }
  try {
    return Response.json(await fn(makeDb(ctx), body));
  } catch (err) {
    if (err instanceof Fail) return Response.json({ message: err.message }, { status: err.status });
    console.error('unhandled', err && err.stack ? err.stack : String(err));
    return Response.json({ message: 'server_error' }, { status: 500 });
  }
}
