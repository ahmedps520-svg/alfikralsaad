// الفكر السعد — ForgeBase edge function `api`
// The website calls POST /functions/v1/api with { action, ...args }.
// Tables are locked with row-level security (no policies), so this function is the
// only way in. It checks PINs, passwords and session tokens, and enforces the
// workplace location rule for every check-in and check-out.

const PBKDF2_ITER = 120000;
const MAX_ACCURACY_M = 150;      // reject fixes less precise than this
const ACCURACY_ALLOWANCE_M = 25; // small tolerance on top of the branch radius
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
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v, max = 120) => (v === null || v === undefined ? null : String(v).trim().slice(0, max) || null);

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
  };
}

async function settings(db) {
  return (await db.one('settings', 'id=eq.1&select=*')) || { company_name: 'الفكر السعد', timezone: 'Asia/Riyadh', grace_minutes: 15 };
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

function empOut(e, branches) {
  const b = branches.find((x) => x.id === e.branch_id);
  return {
    id: e.id, code: e.code, name: e.name, phone: e.phone, job_title: e.job_title, department: e.department,
    branch_id: e.branch_id, branch_name: b ? b.name : null,
    shift_start: e.shift_start, shift_end: e.shift_end, active: !!Number(e.active),
  };
}
const branchOut = (b) => (b ? { id: b.id, name: b.name, lat: num(b.lat), lng: num(b.lng), radius_m: Number(b.radius_m) } : null);

/* ───────── employee actions ───────── */
const actions = {
  async emp_login(db, a) {
    const code = str(a.p_code, 40);
    const ident = 'emp:' + String(code || '').toLowerCase();
    await checkRate(db, ident, 6, 10 * 60e3);
    const e = code ? await db.one('employees', `code=eq.${q(code)}&select=*`) : null;
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
    const e = await requireEmployee(db, a.p_token);
    const s = await settings(db);
    const branches = await db.select('branches', 'select=*');
    const today = localParts(s.timezone).date;
    const hist = await db.select('attendance',
      `employee_id=eq.${q(e.id)}&work_date=gt.${addDays(today, -31)}&select=work_date,check_in,check_out,status,in_distance,out_distance&order=work_date.desc`);
    return {
      employee: empOut(e, branches),
      company: s.company_name, timezone: s.timezone, grace_minutes: Number(s.grace_minutes),
      server_now: nowIso(),
      branch: branchOut(branches.find((b) => b.id === e.branch_id)),
      today: hist.find((h) => h.work_date === today) || null,
      history: hist,
    };
  },

  // Check-in / check-out: ONLY allowed with a live location inside the workplace radius.
  async emp_punch(db, a) {
    const e = await requireEmployee(db, a.p_token);
    const type = a.p_type;
    if (type !== 'in' && type !== 'out') throw new Fail('bad_type');
    const b = e.branch_id ? await db.one('branches', `id=eq.${q(e.branch_id)}&select=*`) : null;
    if (!b || b.lat === null || b.lng === null) throw new Fail('no_workplace');
    const lat = num(a.p_lat), lng = num(a.p_lng), acc = num(a.p_accuracy);
    if (lat === null || lng === null || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Fail('location_required');
    }
    if (acc === null || !isFinite(acc) || acc > MAX_ACCURACY_M) throw new Fail('weak_location');
    const d = Math.round(distanceM(lat, lng, Number(b.lat), Number(b.lng)));
    if (d > Number(b.radius_m) + Math.min(acc, ACCURACY_ALLOWANCE_M)) throw new Fail(`outside_area:${d}`);

    const s = await settings(db);
    const local = localParts(s.timezone);
    const rec = await db.one('attendance', `employee_id=eq.${q(e.id)}&work_date=eq.${local.date}&select=*`);
    if (type === 'in') {
      if (rec && rec.check_in) throw new Fail('already_checked_in');
      const status = local.minutes > hmToMin(e.shift_start) + Number(s.grace_minutes) ? 'late' : 'present';
      const row = await db.insert('attendance', {
        id: uuid(), employee_id: e.id, work_date: local.date, check_in: nowIso(),
        in_lat: lat, in_lng: lng, in_distance: d, status,
      }).catch((err) => { if (err.status === 409) throw new Fail('already_checked_in'); throw err; });
      return { ok: true, status: row.status, check_in: row.check_in, check_out: null, distance: d };
    }
    if (!rec || !rec.check_in) throw new Fail('not_checked_in');
    if (rec.check_out) throw new Fail('already_checked_out');
    const [row] = await db.update('attendance', `id=eq.${q(rec.id)}`, { check_out: nowIso(), out_lat: lat, out_lng: lng, out_distance: d });
    return { ok: true, status: row.status, check_in: row.check_in, check_out: row.check_out, distance: d };
  },

  /* ───────── admin actions ───────── */
  async admin_login(db, a) {
    await checkRate(db, 'admin', 8, 15 * 60e3);
    const s = await settings(db);
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
    await requireAdmin(db, a.p_token);
    const s = await settings(db);
    const today = localParts(s.timezone).date;
    const date = validDate(a.p_date) ? a.p_date : today;
    const [emps, branches, att] = await Promise.all([
      db.select('employees', 'active=eq.1&select=*'),
      db.select('branches', 'select=*'),
      db.select('attendance', `work_date=gte.${addDays(date, -6)}&work_date=lte.${date}&select=*`),
    ]);
    const active = new Set(emps.map((e) => e.id));
    const rows = emps.map((e) => {
      const r = att.find((x) => x.employee_id === e.id && x.work_date === date);
      const b = branches.find((x) => x.id === e.branch_id);
      return {
        id: e.id, code: e.code, name: e.name, department: e.department, job_title: e.job_title,
        branch_name: b ? b.name : null, shift_start: e.shift_start, shift_end: e.shift_end,
        check_in: r ? r.check_in : null, check_out: r ? r.check_out : null, status: r ? r.status : 'absent',
        in_distance: r ? r.in_distance : null, in_lat: r ? r.in_lat : null, in_lng: r ? r.in_lng : null,
      };
    }).sort((x, y) => (x.check_in && y.check_in ? x.check_in.localeCompare(y.check_in) : x.check_in ? -1 : y.check_in ? 1 : x.name.localeCompare(y.name, 'ar')));
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(date, -i);
      const day = att.filter((x) => x.work_date === d && active.has(x.employee_id));
      week.push({ d, on_time: day.filter((x) => x.status === 'present').length, late: day.filter((x) => x.status === 'late').length });
    }
    return { date, today, company: s.company_name, timezone: s.timezone, rows, week };
  },

  async admin_list(db, a) {
    await requireAdmin(db, a.p_token);
    const [emps, branches, s] = await Promise.all([
      db.select('employees', 'select=*&order=created_at.asc'),
      db.select('branches', 'select=*&order=created_at.asc'),
      settings(db),
    ]);
    return {
      employees: emps.map((e) => empOut(e, branches)),
      branches: branches.map((b) => ({ ...branchOut(b), employees: emps.filter((e) => e.branch_id === b.id).length })),
      settings: { company_name: s.company_name, timezone: s.timezone, grace_minutes: Number(s.grace_minutes) },
    };
  },

  async admin_save_employee(db, a) {
    await requireAdmin(db, a.p_token);
    const p = a.p || {};
    const id = str(p.id, 64);
    const name = str(p.name), code = str(p.code, 40);
    if (!name || !code) throw new Fail('missing_fields');
    const pin = str(p.pin, 20);
    if (pin !== null && !/^\d{4,8}$/.test(pin)) throw new Fail('bad_pin');
    if (!id && pin === null) throw new Fail('bad_pin');
    const dup = await db.one('employees', `code=eq.${q(code)}&select=id`);
    if (dup && dup.id !== id) throw new Fail('duplicate_code');
    const branchId = str(p.branch_id, 64);
    if (branchId && !(await db.one('branches', `id=eq.${q(branchId)}&select=id`))) throw new Fail('missing_fields');
    const row = {
      code, name, phone: str(p.phone, 30), job_title: str(p.job_title), department: str(p.department),
      branch_id: branchId,
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
    return empOut(saved, await db.select('branches', 'select=id,name'));
  },

  async admin_delete_employee(db, a) {
    await requireAdmin(db, a.p_token);
    const id = str(a.p_id, 64);
    if (!id) throw new Fail('missing_fields');
    await db.remove('sessions', `employee_id=eq.${q(id)}`);
    await db.remove('attendance', `employee_id=eq.${q(id)}`);
    await db.remove('employees', `id=eq.${q(id)}`);
    return { ok: true };
  },

  async admin_save_branch(db, a) {
    await requireAdmin(db, a.p_token);
    const p = a.p || {};
    const id = str(p.id, 64), name = str(p.name);
    if (!name) throw new Fail('missing_fields');
    const lat = num(p.lat), lng = num(p.lng);
    if ((lat === null) !== (lng === null)) throw new Fail('bad_location');
    if (lat !== null && (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Fail('bad_location');
    const radius = Math.min(2000, Math.max(20, Math.round(num(p.radius_m) || 150)));
    const row = { name, lat, lng, radius_m: radius };
    if (!id) return branchOut(await db.insert('branches', { id: uuid(), created_at: nowIso(), ...row }));
    const [saved] = await db.update('branches', `id=eq.${q(id)}`, row);
    if (!saved) throw new Fail('not_found', 404);
    return branchOut(saved);
  },

  async admin_delete_branch(db, a) {
    await requireAdmin(db, a.p_token);
    const id = str(a.p_id, 64);
    if (!id) throw new Fail('missing_fields');
    await db.update('employees', `branch_id=eq.${q(id)}`, { branch_id: null });
    await db.remove('branches', `id=eq.${q(id)}`);
    return { ok: true };
  },

  async admin_attendance(db, a) {
    await requireAdmin(db, a.p_token);
    if (!validDate(a.p_from) || !validDate(a.p_to)) throw new Fail('missing_fields');
    let query = `work_date=gte.${a.p_from}&work_date=lte.${a.p_to}&select=*&order=work_date.desc,check_in.asc`;
    if (a.p_employee) query += `&employee_id=eq.${q(String(a.p_employee))}`;
    const [att, emps] = await Promise.all([db.select('attendance', query), db.select('employees', 'select=id,code,name,department')]);
    return att.map((r) => {
      const e = emps.find((x) => x.id === r.employee_id) || {};
      return {
        id: r.id, work_date: r.work_date, check_in: r.check_in, check_out: r.check_out, status: r.status,
        in_distance: r.in_distance, out_distance: r.out_distance,
        employee_id: r.employee_id, code: e.code, name: e.name || '—', department: e.department,
      };
    });
  },

  async admin_delete_attendance(db, a) {
    await requireAdmin(db, a.p_token);
    const id = str(a.p_id, 64);
    if (!id) throw new Fail('missing_fields');
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
