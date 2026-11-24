# الفكر السعد · نظام الحضور والانصراف

A simple, Arabic-first, phone-first attendance app. Employees confirm they arrived at work with one tap, and an admin dashboard shows who is in, late, absent, or gone home.

- **Employee app:** `index.html`
- **Admin dashboard:** `admin.html`
- **Live site:** https://ahmedps520-svg.github.io/alfikralsaad/

## Features

**Employees (phone)**
- Sign in with their **mobile number** and a numeric PIN. `05…`, `+9665…` and `9665…` all work.
- One big button: **check in**, then it becomes an orange **check out** (leave work). Employees can check in and out several times a day, e.g. when moving to another site. Today's prints appear as a timeline, and hours worked add up across all periods.
- **Proof of presence (works at any site):** every check-in and check-out needs
  1. a **live selfie** taken with the in-app front camera (no gallery uploads), stamped with the time and GPS position;
  2. the phone's **GPS position** (location must be on), which is logged with its accuracy;
  3. optionally, the **site name** ("where are you working today?"), with recent sites suggested.
- **Safety papers (أوراقي):** photograph each page with the rear camera (or pick photos). The app improves the contrast and builds **one PDF on the phone**, which the employee names (e.g. "تصريح عمل") and uploads. Employees can open everything they've uploaded.
- Work timer, today's shift, the last 7 days at a glance, and a full 30-day history.
- Can be installed to the home screen (PWA manifest), with light and dark mode.

**Admin**
- Today's dashboard: attendance rate, present, late, absent and checked-out counts, and a 7-day chart. Each employee shows their check-in selfie and site. Tap a row to see the **check-in and check-out selfies, times, sites, GPS accuracy and map links**. Refreshes automatically every 30 seconds.
- Employees: a list of every employee's **name, mobile number and PIN**. Tap the eye or "Show PINs" to reveal them, and the key button to **reset a PIN**, which signs the employee out everywhere and shares the new PIN. You can also add, edit, suspend or delete employees and set their shift times.
- **All prints:** every check-in and check-out ever made, newest first, with photo, time, site, GPS accuracy and a map link. Filter by employee and dates (leave them empty for all time), load more, open any print full-size, and export everything to Excel (CSV).
- **Safety papers:** every PDF uploaded by employees, newest first, filterable by employee. You can open, view the details of and delete each one.
- Settings: company name, time zone, late grace minutes, and the admin password.

## Languages

Arabic is the default. A clear **عربي | EN** switch sits on both sign-in screens, in the header of every screen, in the employee's Account page and in the admin Settings. The choice is remembered on each device. English switches the whole layout to left-to-right and formats dates, times and numbers in English. Names, sites and other data people type stay as they are. Translations live in `assets/i18n.js`.

## How it works

The site is plain static HTML, CSS and JS, with no build step. GitHub Pages serves it from the `gh-pages` branch, which `.github/workflows/pages.yml` keeps mirrored from `main`.

The backend is [ForgeBase](https://forgebase.art/docs), project **Alfikr Alsaad** (`eavvmysvbnldzaevrtki`):

- The SQLite tables are defined in `forgebase/schema.sql`. Each one has row-level security on and **no policies**, so the public anon key can't read or write them directly.
- `forgebase/functions/api/index.js` holds the code for the `api` edge function, which is the only way in. It checks employee PINs and the admin password (stored as PBKDF2 hashes) and session tokens (stored as SHA-256 hashes), and rate-limits repeated failed logins. It also refuses any check-in without a real selfie image and a GPS position.
- PINs are stored twice: as a PBKDF2 hash for sign-in, and AES-GCM encrypted (key in the `PIN_KEY` project secret) so the admin can view them.
- Every print is a row in `punches`, and `attendance` keeps the daily summary.
- Selfies live in the **private** storage bucket `selfies`, and safety-paper PDFs (built on the phone by `assets/pdf.js`) live in the private bucket `documents`, listed in the `documents` table. The admin dashboard gets signed links that expire after one hour.
- CORS is limited to `https://ahmedps520-svg.github.io`.

To change the backend, edit `forgebase/functions/api/index.js` and redeploy it from the ForgeBase dashboard (Edge Functions → api), or ask Claude to do it with the ForgeBase MCP.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
