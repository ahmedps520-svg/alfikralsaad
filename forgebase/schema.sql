-- الفكر السعد · ForgeBase (SQLite) schema
-- Every table has row-level security ON with NO policies, so the public anon key
-- cannot read or write anything directly. All access goes through the `api` edge
-- function (forgebase/functions/api/index.js), which checks PINs, passwords and sessions.
-- Check-in selfies are stored in a PRIVATE storage bucket named `selfies` (no policies);
-- the admin dashboard gets short-lived signed URLs from the edge function.

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'الفكر السعد',
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
  pin_hash TEXT NOT NULL,
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
  in_lat REAL, in_lng REAL, in_accuracy REAL, in_site TEXT, in_photo TEXT,      -- photo = path in the private `selfies` bucket
  out_lat REAL, out_lng REAL, out_accuracy REAL, out_site TEXT, out_photo TEXT,
  status TEXT NOT NULL DEFAULT 'present',
  UNIQUE (employee_id, work_date)
);
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
