-- الفكر الساعد · ForgeBase (SQLite) schema
-- Every table has row-level security ON with NO policies, so the public anon key
-- cannot read or write anything directly. All access goes through the `api` edge
-- function (forgebase/functions/api/index.js), which checks PINs, passwords and sessions.
-- Check-in selfies are stored in a PRIVATE storage bucket named `selfies` (no policies);
-- the admin dashboard gets short-lived signed URLs from the edge function.

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'الفكر الساعد',
  timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  grace_minutes INTEGER NOT NULL DEFAULT 15,
  admin_pass_hash TEXT
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,               -- as typed by the admin, e.g. 0501234567
  phone_key TEXT UNIQUE,    -- last 9 digits, used for login (05.., +9665.., 9665.. all match)
  job_title TEXT,
  department TEXT,
  pin_hash TEXT NOT NULL,   -- PBKDF2 hash, used for sign-in
  pin_enc TEXT,             -- AES-GCM encrypted copy (key: PIN_KEY secret) so the admin can view it
  shift_start TEXT NOT NULL DEFAULT '08:00',
  shift_end TEXT NOT NULL DEFAULT '16:00',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  in_lat REAL, in_lng REAL, in_accuracy REAL, in_site TEXT, in_photo TEXT,      -- first check-in; photo = path in the private `selfies` bucket
  out_lat REAL, out_lng REAL, out_accuracy REAL, out_site TEXT, out_photo TEXT,  -- last check-out
  status TEXT NOT NULL DEFAULT 'present',   -- from the FIRST check-in of the day
  last_in TEXT,                             -- set while the employee is checked in
  worked_minutes INTEGER NOT NULL DEFAULT 0, -- sum of all in→out periods that day
  UNIQUE (employee_id, work_date)
);

-- Every print (check-in or check-out) ever made, with its selfie and position.
CREATE TABLE IF NOT EXISTS punches (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in','out')),
  at TEXT NOT NULL,
  lat REAL, lng REAL, accuracy REAL,
  site TEXT,
  photo TEXT
);
CREATE INDEX IF NOT EXISTS punches_emp_idx ON punches (employee_id, at);
CREATE INDEX IF NOT EXISTS punches_at_idx ON punches (at);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (work_date);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('admin','employee')),
  employee_id TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY,
  ident TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (ident, at);

-- Safety papers: the employee photographs the pages, the app builds one PDF on the phone,
-- and it is stored in the PRIVATE storage bucket `documents` (PDF only, no policies).
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  pages INTEGER NOT NULL DEFAULT 1,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,          -- path in the `documents` bucket
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS documents_emp_idx ON documents (employee_id, created_at);
CREATE INDEX IF NOT EXISTS documents_created_idx ON documents (created_at);
