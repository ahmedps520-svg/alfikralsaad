# الفكر السعد · نظام الحضور والانصراف

A simple, Arabic-first, phone-first attendance app. Employees confirm they arrived at work with one tap, and an admin dashboard shows who is in, late, absent, or gone home.

- **Employee app:** `index.html`
- **Admin dashboard:** `admin.html`
- **Live site:** https://ahmedps520-svg.github.io/alfikralsaad/

## Features

**Employees (phone)**
- Sign in with an employee number and a numeric PIN.
- One big button to check in and check out, with a live clock (Gregorian and Hijri dates).
- **Strict location rule:** check-in and check-out only work when the phone's location is on, accurate (±150 m or better), and inside the workplace radius set by the admin. If the employee has no branch with a location, they can't check in at all. The button stays locked until these conditions are met, and the server enforces the same rule.
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

The backend is [ForgeBase](https://forgebase.art/docs), project **Alfikr Alsaad** (`eavvmysvbnldzaevrtki`):

- The SQLite tables are defined in `forgebase/schema.sql`. Each one has row-level security on and **no policies**, so the public anon key can't read or write them directly.
- `forgebase/functions/api/index.js` holds the code for the `api` edge function, which is the only way in. It checks employee PINs and the admin password (stored as PBKDF2 hashes) and session tokens (stored as SHA-256 hashes), rate-limits repeated failed logins, and enforces the workplace location rule.
- CORS is limited to `https://ahmedps520-svg.github.io`.

To change the backend, edit `forgebase/functions/api/index.js` and redeploy it from the ForgeBase dashboard (Edge Functions → api), or ask Claude to do it with the ForgeBase MCP.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
