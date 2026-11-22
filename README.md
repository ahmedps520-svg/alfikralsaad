# الفكر السعد · نظام الحضور والانصراف

A simple, Arabic-first, phone-first attendance app. Employees confirm they arrived at work with one tap, and an admin dashboard shows who is in, late, absent, or gone home.

- **Employee app:** `index.html`
- **Admin dashboard:** `admin.html`
- **Live site:** https://ahmedps520-svg.github.io/alfikralsaad/

## Features

**Employees (phone)**
- Sign in with their **mobile number** and a numeric PIN. `05…`, `+9665…` and `9665…` all work.
- One big button to check in and check out, with a live clock (Gregorian and Hijri dates).
- **Proof of presence (works at any site):** every check-in and check-out needs
  1. a **live selfie** taken with the in-app front camera (no gallery uploads), stamped with the time and GPS position;
  2. the phone's **GPS position** (location must be on), which is logged with its accuracy;
  3. optionally, the **site name** ("where are you working today?"), with recent sites suggested.
- Work timer, today's shift, the last 7 days at a glance, and a full 30-day history.
- Can be installed to the home screen (PWA manifest), with light and dark mode.

**Admin**
- Today's dashboard: attendance rate, present, late, absent and checked-out counts, and a 7-day chart. Each employee shows their check-in selfie and site. Tap a row to see the **check-in and check-out selfies, times, sites, GPS accuracy and map links**. Refreshes automatically every 30 seconds.
- Employees: add, edit, suspend or delete them, set their mobile number (used to log in), PIN and shift times, and share login details over WhatsApp.
- Records: filter by date range and employee, view the selfies, and export to Excel (CSV) with sites and coordinates.
- Settings: company name, time zone, late grace minutes, and the admin password.

## Languages

Arabic is the default. A clear **عربي | EN** switch sits on both sign-in screens, in the header of every screen, in the employee's Account page and in the admin Settings. The choice is remembered on each device. English switches the whole layout to left-to-right and formats dates, times and numbers in English. Names, sites and other data people type stay as they are. Translations live in `assets/i18n.js`.

## How it works

The site is plain static HTML, CSS and JS, with no build step. GitHub Pages serves it from the `gh-pages` branch, which `.github/workflows/pages.yml` keeps mirrored from `main`.

The backend is [ForgeBase](https://forgebase.art/docs), project **Alfikr Alsaad** (`eavvmysvbnldzaevrtki`):

- The SQLite tables are defined in `forgebase/schema.sql`. Each one has row-level security on and **no policies**, so the public anon key can't read or write them directly.
- `forgebase/functions/api/index.js` holds the code for the `api` edge function, which is the only way in. It checks employee PINs and the admin password (stored as PBKDF2 hashes) and session tokens (stored as SHA-256 hashes), and rate-limits repeated failed logins. It also refuses any check-in without a real selfie image and a GPS position.
- Selfies live in the **private** storage bucket `selfies`. The admin dashboard gets signed links that expire after one hour.
- CORS is limited to `https://ahmedps520-svg.github.io`.

To change the backend, edit `forgebase/functions/api/index.js` and redeploy it from the ForgeBase dashboard (Edge Functions → api), or ask Claude to do it with the ForgeBase MCP.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
