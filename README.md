# الفكر السعد · نظام الحضور والانصراف

A simple, Arabic-first, phone-first attendance app. Employees confirm they arrived at work with one tap, and an admin dashboard shows who is in, late, absent, or gone home.

- **Employee app:** `index.html`
- **Admin dashboard:** `admin.html`
- **Live site:** https://ahmedps520-svg.github.io/alfikralsaad/

## Features

**Employees (phone)**
- Sign in with an employee number and a numeric PIN.
- One big button to check in and check out, with a live clock (Gregorian and Hijri dates).
- Location check: the server only accepts a check-in when the phone is inside the branch radius.
- Work timer, today's shift, the last 7 days at a glance, and a full 30-day history.
- Can be installed to the home screen (PWA manifest), with light and dark mode.

**Admin**
- Today's dashboard: attendance rate, present, late, absent and checked-out counts, a 7-day chart, search, filters, and a detail sheet for each employee (with a map link to where they checked in). Refreshes automatically every 30 seconds.
- Employees: add, edit, suspend or delete them, set their shift times and branch, reset their PIN, and share login details over WhatsApp.
- Records: filter by date range and employee, and export to Excel (CSV).
- Branches: set a location with "use my current location" and choose the allowed radius.
- Settings: company name, time zone, late grace minutes, and the admin password.

## How it works

The site is plain static HTML, CSS and JS, with no build step. GitHub Pages serves it from the `gh-pages` branch, which `.github/workflows/pages.yml` keeps mirrored from `main`.

Data lives in Supabase in a private `alfikr` schema that the API does not expose. The browser can only call the `public.alfikr_*` functions, which check the session token. PINs and the admin password are stored as bcrypt hashes, and repeated failed logins are rate-limited. See `supabase/schema.sql`.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
