-- الفكر السعد · نظام الحضور والانصراف
-- Isolated schema: all tables live in the private `alfikr` schema (not exposed by the API).
-- The web app only talks to the SECURITY DEFINER functions named public.alfikr_*.

create schema if not exists alfikr;
revoke all on schema alfikr from public, anon, authenticated;

create table if not exists alfikr.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'الفكر السعد',
  timezone text not null default 'Asia/Riyadh',
  grace_minutes int not null default 15,
  admin_pass_hash text
);
insert into alfikr.settings (id) values (1) on conflict do nothing;

create table if not exists alfikr.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision,
  lng double precision,
  radius_m int not null default 150,
  created_at timestamptz not null default now()
);

create table if not exists alfikr.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  job_title text,
  department text,
  pin_hash text not null,
  branch_id uuid references alfikr.branches(id) on delete set null,
  shift_start time not null default '08:00',
  shift_end time not null default '16:00',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists alfikr.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references alfikr.employees(id) on delete cascade,
  work_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  in_lat double precision, in_lng double precision, in_distance int,
  out_lat double precision, out_lng double precision, out_distance int,
  status text not null default 'present',
  unique (employee_id, work_date)
);
create index if not exists attendance_date_idx on alfikr.attendance (work_date);

create table if not exists alfikr.sessions (
  token text primary key,
  kind text not null check (kind in ('admin','employee')),
  employee_id uuid references alfikr.employees(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists alfikr.login_attempts (
  ident text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_idx on alfikr.login_attempts (ident, at);

alter table alfikr.settings enable row level security;
alter table alfikr.branches enable row level security;
alter table alfikr.employees enable row level security;
alter table alfikr.attendance enable row level security;
alter table alfikr.sessions enable row level security;
alter table alfikr.login_attempts enable row level security;

-- ───────── helpers (private) ─────────
create or replace function alfikr.tz() returns text language sql stable
set search_path = alfikr, pg_temp as $$ select timezone from alfikr.settings where id = 1 $$;

create or replace function alfikr.today() returns date language sql stable
set search_path = alfikr, pg_temp as $$ select (now() at time zone alfikr.tz())::date $$;

create or replace function alfikr.new_token() returns text language sql volatile
set search_path = alfikr, extensions, pg_temp as $$ select encode(extensions.gen_random_bytes(24), 'hex') $$;

create or replace function alfikr.check_rate(p_ident text, p_max int, p_window interval) returns void
language plpgsql set search_path = alfikr, pg_temp as $$
begin
  delete from alfikr.login_attempts where at < now() - interval '1 day';
  if (select count(*) from alfikr.login_attempts where ident = p_ident and at > now() - p_window) >= p_max then
    raise exception 'too_many_attempts';
  end if;
end $$;

create or replace function alfikr.require_admin(p_token text) returns void
language plpgsql set search_path = alfikr, pg_temp as $$
begin
  if not exists (select 1 from alfikr.sessions where token = p_token and kind = 'admin' and expires_at > now()) then
    raise exception 'unauthorized';
  end if;
end $$;

create or replace function alfikr.employee_of(p_token text) returns uuid
language plpgsql set search_path = alfikr, pg_temp as $$
declare v uuid;
begin
  select s.employee_id into v from alfikr.sessions s join alfikr.employees e on e.id = s.employee_id
   where s.token = p_token and s.kind = 'employee' and s.expires_at > now() and e.active;
  if v is null then raise exception 'unauthorized'; end if;
  return v;
end $$;

create or replace function alfikr.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function alfikr.employee_json(p_id uuid) returns json
language sql stable set search_path = alfikr, pg_temp as $$
  select json_build_object(
    'id', e.id, 'code', e.code, 'name', e.name, 'phone', e.phone, 'job_title', e.job_title,
    'department', e.department, 'branch_id', e.branch_id, 'branch_name', b.name,
    'shift_start', to_char(e.shift_start, 'HH24:MI'), 'shift_end', to_char(e.shift_end, 'HH24:MI'),
    'active', e.active)
  from alfikr.employees e left join alfikr.branches b on b.id = e.branch_id where e.id = p_id
$$;

-- ───────── employee API ─────────
create or replace function public.alfikr_emp_login(p_code text, p_pin text) returns json
language plpgsql security definer set search_path = alfikr, extensions, pg_temp as $$
declare e alfikr.employees; t text;
begin
  perform alfikr.check_rate('emp:' || lower(trim(p_code)), 6, interval '10 minutes');
  select * into e from alfikr.employees where lower(code) = lower(trim(p_code)) and active;
  if e.id is null or e.pin_hash <> extensions.crypt(p_pin, e.pin_hash) then
    insert into alfikr.login_attempts (ident) values ('emp:' || lower(trim(p_code)));
    raise exception 'invalid_login';
  end if;
  delete from alfikr.login_attempts where ident = 'emp:' || lower(trim(p_code));
  delete from alfikr.sessions where expires_at < now();
  t := alfikr.new_token();
  insert into alfikr.sessions (token, kind, employee_id, expires_at) values (t, 'employee', e.id, now() + interval '60 days');
  return json_build_object('token', t);
end $$;

create or replace function public.alfikr_emp_logout(p_token text) returns void
language sql security definer set search_path = alfikr, pg_temp as $$
  delete from alfikr.sessions where token = p_token and kind = 'employee'
$$;

create or replace function public.alfikr_emp_me(p_token text) returns json
language plpgsql security definer set search_path = alfikr, pg_temp as $$
declare v uuid := alfikr.employee_of(p_token); s alfikr.settings; b alfikr.branches;
begin
  select * into s from alfikr.settings where id = 1;
  select br.* into b from alfikr.branches br join alfikr.employees e on e.branch_id = br.id where e.id = v;
  return json_build_object(
    'employee', alfikr.employee_json(v),
    'company', s.company_name, 'timezone', s.timezone, 'grace_minutes', s.grace_minutes,
    'server_now', now(),
    'branch', case when b.id is null then null else json_build_object('name', b.name, 'lat', b.lat, 'lng', b.lng, 'radius_m', b.radius_m) end,
    'today', (select row_to_json(a) from (select work_date, check_in, check_out, status, in_distance, out_distance
               from alfikr.attendance where employee_id = v and work_date = alfikr.today()) a),
    'history', coalesce((select json_agg(h order by h.work_date desc) from (
               select work_date, check_in, check_out, status from alfikr.attendance
                where employee_id = v and work_date > alfikr.today() - 31 order by work_date desc) h), '[]'::json)
  );
end $$;

create or replace function public.alfikr_emp_punch(p_token text, p_type text, p_lat double precision, p_lng double precision, p_accuracy double precision default null)
returns json language plpgsql security definer set search_path = alfikr, pg_temp as $$
declare v uuid := alfikr.employee_of(p_token); e alfikr.employees; b alfikr.branches; s alfikr.settings;
        d int; a alfikr.attendance; local_now timestamp; st text;
begin
  select * into e from alfikr.employees where id = v;
  select * into s from alfikr.settings where id = 1;
  select * into b from alfikr.branches where id = e.branch_id;
  if b.id is not null and b.lat is not null and b.lng is not null then
    if p_lat is null or p_lng is null then raise exception 'location_required'; end if;
    d := round(alfikr.distance_m(p_lat, p_lng, b.lat, b.lng));
    if d > b.radius_m + least(coalesce(p_accuracy, 0), 50) then
      raise exception 'outside_area:%', d;
    end if;
  end if;

  select * into a from alfikr.attendance where employee_id = v and work_date = alfikr.today();
  local_now := now() at time zone s.timezone;

  if p_type = 'in' then
    if a.check_in is not null then raise exception 'already_checked_in'; end if;
    st := case when local_now::time > e.shift_start + make_interval(mins => s.grace_minutes) then 'late' else 'present' end;
    insert into alfikr.attendance (employee_id, work_date, check_in, in_lat, in_lng, in_distance, status)
    values (v, alfikr.today(), now(), p_lat, p_lng, d, st)
    returning * into a;
  elsif p_type = 'out' then
    if a.check_in is null then raise exception 'not_checked_in'; end if;
    if a.check_out is not null then raise exception 'already_checked_out'; end if;
    update alfikr.attendance set check_out = now(), out_lat = p_lat, out_lng = p_lng, out_distance = d
     where id = a.id returning * into a;
  else
    raise exception 'bad_type';
  end if;
  return json_build_object('ok', true, 'status', a.status, 'check_in', a.check_in, 'check_out', a.check_out, 'distance', d);
end $$;

-- ───────── admin API ─────────
create or replace function public.alfikr_admin_login(p_password text) returns json
language plpgsql security definer set search_path = alfikr, extensions, pg_temp as $$
declare h text; t text;
begin
  perform alfikr.check_rate('admin', 8, interval '15 minutes');
  select admin_pass_hash into h from alfikr.settings where id = 1;
  if h is null or h <> extensions.crypt(p_password, h) then
    insert into alfikr.login_attempts (ident) values ('admin');
    raise exception 'invalid_login';
  end if;
  delete from alfikr.login_attempts where ident = 'admin';
  delete from alfikr.sessions where expires_at < now();
  t := alfikr.new_token();
  insert into alfikr.sessions (token, kind, expires_at) values (t, 'admin', now() + interval '7 days');
  return json_build_object('token', t);
end $$;

create or replace function public.alfikr_admin_logout(p_token text) returns void
language sql security definer set search_path = alfikr, pg_temp as $$
  delete from alfikr.sessions where token = p_token and kind = 'admin'
$$;

create or replace function public.alfikr_admin_overview(p_token text, p_date date default null) returns json
language plpgsql security definer set search_path = alfikr, pg_temp as $$
declare dte date; rows json; s alfikr.settings; week json;
begin
  perform alfikr.require_admin(p_token);
  select * into s from alfikr.settings where id = 1;
  dte := coalesce(p_date, alfikr.today());
  select coalesce(json_agg(r order by r.check_in nulls last, r.name), '[]'::json) into rows from (
    select e.id, e.code, e.name, e.department, e.job_title, b.name as branch_name,
           to_char(e.shift_start, 'HH24:MI') as shift_start, to_char(e.shift_end, 'HH24:MI') as shift_end,
           a.check_in, a.check_out, coalesce(a.status, 'absent') as status, a.in_distance, a.in_lat, a.in_lng
      from alfikr.employees e
      left join alfikr.branches b on b.id = e.branch_id
      left join alfikr.attendance a on a.employee_id = e.id and a.work_date = dte
     where e.active) r;
  select coalesce(json_agg(w order by w.d), '[]'::json) into week from (
    select gs::date as d,
           (select count(*) from alfikr.attendance a join alfikr.employees e on e.id = a.employee_id
             where a.work_date = gs::date and e.active and a.status = 'present') as on_time,
           (select count(*) from alfikr.attendance a join alfikr.employees e on e.id = a.employee_id
             where a.work_date = gs::date and e.active and a.status = 'late') as late
      from generate_series(dte - 6, dte, interval '1 day') gs) w;
  return json_build_object('date', dte, 'today', alfikr.today(), 'company', s.company_name,
                           'timezone', s.timezone, 'rows', rows, 'week', week);
end $$;

create or replace function public.alfikr_admin_list(p_token text) returns json
language plpgsql security definer set search_path = alfikr, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  return json_build_object(
    'employees', coalesce((select json_agg(alfikr.employee_json(e.id) order by e.created_at) from alfikr.employees e), '[]'::json),
    'branches', coalesce((select json_agg(json_build_object('id', b.id, 'name', b.name, 'lat', b.lat, 'lng', b.lng, 'radius_m', b.radius_m,
                  'employees', (select count(*) from alfikr.employees e where e.branch_id = b.id)) order by b.created_at)
                  from alfikr.branches b), '[]'::json),
    'settings', (select json_build_object('company_name', company_name, 'timezone', timezone, 'grace_minutes', grace_minutes)
                   from alfikr.settings where id = 1));
end $$;

create or replace function public.alfikr_admin_save_employee(p_token text, p jsonb) returns json
language plpgsql security definer set search_path = alfikr, extensions, pg_temp as $$
declare v uuid := nullif(p->>'id', '')::uuid; pin text := nullif(p->>'pin', '');
begin
  perform alfikr.require_admin(p_token);
  if coalesce(trim(p->>'name'), '') = '' or coalesce(trim(p->>'code'), '') = '' then raise exception 'missing_fields'; end if;
  if pin is not null and pin !~ '^[0-9]{4,8}$' then raise exception 'bad_pin'; end if;
  if exists (select 1 from alfikr.employees where lower(code) = lower(trim(p->>'code')) and id is distinct from v) then
    raise exception 'duplicate_code';
  end if;
  if v is null then
    if pin is null then raise exception 'bad_pin'; end if;
    insert into alfikr.employees (code, name, phone, job_title, department, pin_hash, branch_id, shift_start, shift_end, active)
    values (trim(p->>'code'), trim(p->>'name'), p->>'phone', p->>'job_title', p->>'department',
            extensions.crypt(pin, extensions.gen_salt('bf')), nullif(p->>'branch_id', '')::uuid,
            coalesce(nullif(p->>'shift_start', '')::time, '08:00'), coalesce(nullif(p->>'shift_end', '')::time, '16:00'),
            coalesce((p->>'active')::boolean, true))
    returning id into v;
  else
    update alfikr.employees set code = trim(p->>'code'), name = trim(p->>'name'), phone = p->>'phone',
      job_title = p->>'job_title', department = p->>'department', branch_id = nullif(p->>'branch_id', '')::uuid,
      shift_start = coalesce(nullif(p->>'shift_start', '')::time, shift_start),
      shift_end = coalesce(nullif(p->>'shift_end', '')::time, shift_end),
      active = coalesce((p->>'active')::boolean, active),
      pin_hash = case when pin is null then pin_hash else extensions.crypt(pin, extensions.gen_salt('bf')) end
    where id = v;
    if pin is not null or coalesce((p->>'active')::boolean, true) = false then
      delete from alfikr.sessions where employee_id = v;
    end if;
  end if;
  return alfikr.employee_json(v);
end $$;

create or replace function public.alfikr_admin_delete_employee(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = alfikr, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  delete from alfikr.employees where id = p_id;
end $$;

create or replace function public.alfikr_admin_save_branch(p_token text, p jsonb) returns json
language plpgsql security definer set search_path = alfikr, pg_temp as $$
declare v uuid := nullif(p->>'id', '')::uuid;
begin
  perform alfikr.require_admin(p_token);
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'missing_fields'; end if;
  if v is null then
    insert into alfikr.branches (name, lat, lng, radius_m)
    values (trim(p->>'name'), nullif(p->>'lat', '')::float8, nullif(p->>'lng', '')::float8, coalesce(nullif(p->>'radius_m', '')::int, 150))
    returning id into v;
  else
    update alfikr.branches set name = trim(p->>'name'), lat = nullif(p->>'lat', '')::float8, lng = nullif(p->>'lng', '')::float8,
      radius_m = coalesce(nullif(p->>'radius_m', '')::int, radius_m) where id = v;
  end if;
  return json_build_object('id', v);
end $$;

create or replace function public.alfikr_admin_delete_branch(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = alfikr, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  delete from alfikr.branches where id = p_id;
end $$;

create or replace function public.alfikr_admin_attendance(p_token text, p_from date, p_to date, p_employee uuid default null) returns json
language plpgsql security definer set search_path = alfikr, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  return coalesce((select json_agg(r order by r.work_date desc, r.check_in) from (
    select a.id, a.work_date, a.check_in, a.check_out, a.status, a.in_distance, a.out_distance,
           e.id as employee_id, e.code, e.name, e.department
      from alfikr.attendance a join alfikr.employees e on e.id = a.employee_id
     where a.work_date between p_from and p_to and (p_employee is null or a.employee_id = p_employee)) r), '[]'::json);
end $$;

create or replace function public.alfikr_admin_delete_attendance(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = alfikr, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  delete from alfikr.attendance where id = p_id;
end $$;

create or replace function public.alfikr_admin_save_settings(p_token text, p jsonb) returns void
language plpgsql security definer set search_path = alfikr, extensions, pg_temp as $$
begin
  perform alfikr.require_admin(p_token);
  if nullif(p->>'timezone', '') is not null and not exists (select 1 from pg_timezone_names where name = p->>'timezone') then
    raise exception 'bad_timezone';
  end if;
  update alfikr.settings set
    company_name = coalesce(nullif(trim(p->>'company_name'), ''), company_name),
    timezone = coalesce(nullif(p->>'timezone', ''), timezone),
    grace_minutes = coalesce(nullif(p->>'grace_minutes', '')::int, grace_minutes)
  where id = 1;
  if length(coalesce(p->>'new_password', '')) > 0 then
    if length(p->>'new_password') < 6 then raise exception 'weak_password'; end if;
    update alfikr.settings set admin_pass_hash = extensions.crypt(p->>'new_password', extensions.gen_salt('bf')) where id = 1;
    delete from alfikr.sessions where kind = 'admin' and token <> p_token;
  end if;
end $$;

-- Lock down: only the public API functions are callable by the web client.
revoke all on all functions in schema alfikr from public, anon, authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'alfikr\_%' loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
