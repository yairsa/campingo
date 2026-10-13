# The organizers' sheet syncs by itself, and says when it can't

**Status:** built 15/10/2026 (boxes 1-4). Next: the gate box in §3, then Yair's paste + deploy + enableAlerts.

## 1. The request (Yair, 15/10/2026)

> *"sync should happen automatically, not manually"*

He asked after seeing that the organizers' sheet ("אכזיב 2026 — מארגנים", id `1vtvUtSIK5dxfZatYt5beETLZPTmDgxrNX0hk687Do3c`) was last modified 30/09/2026 10:28, the day it was created (Drive metadata, read 15/10/2026).

## 2. Facts (read 15/10/2026 in `backend/Code.source.gs`)

- The sync is **already automatic on writes**: `syncOrganizers_` runs after a site `save` / `delete` / activity write (line ~81) and after a managing-page family write (line ~70), inside `try {} catch {}` so it can never break a registration.
- **There is no retry.** One failed sync leaves the sheet stale until the next write. **Hand edits** in the registration sheet never sync: `onEdit` (line ~755) is a simple trigger, which cannot open another spreadsheet anyway.
- **Nothing reports a failure.** `syncOrganizers_` returns `false` only when not connected (`ORG_PROP` unset); an exception (for example a missing Drive/Sheets permission on the web app) is swallowed.
- There is already an installable time trigger: `sendDigest`, every 2 hours, installed by the menu item `enableAlerts`. Installable triggers run with the owner's authorization, so they can open the organizers' sheet.
- Unknown: whether `ORG_PROP` is set at all, and whether there were registrations after 30/09. The new status record (box 1) answers both.

## 3. Tasks

- [x] Record every sync's outcome in a script property `ORG_SYNC` (`{at, ok, error, trip}`): set by `syncOrganizers_` callers through one wrapper (`syncSafe_(trip)`) that replaces the bare `try/catch` at both call sites; "not connected" is recorded too
  - test in `tests/backend.test.js`: success, a thrown error, not connected; plus a source check that no call site bypasses the wrapper. The menu items (`syncNow`, `connectOrganizers`, `addDemoActivities`) use it too, so `סנכרון עכשיו` now shows the error text instead of nothing.
- [x] `sendDigest` (the 2-hour trigger) also runs `syncAllOrganizers_()` through the wrapper: a failed sync catches up, and hand edits reach the organizers within 2 hours
- [x] When a sync fails, email Yair once per distinct error (keyed on the error text, cleared on the next success), from the same 2-hour run; subject and body in Hebrew via `Code.source.gs` (never typed into the terminal)
  - `syncAlert_(rec, alerted, url)` is pure and tested; the last mailed error is kept in `ORG_SYNC_ALERTED`. "Not connected" mails too, with how to connect.
- [x] ~~The managing page (`admin.html`) shows the last sync time and state in one line, if it already loads backend status cheaply; otherwise skip and strike this box with the reason~~ — dropped: `admin.js` loads no backend status (it never calls `adminMe`; the login is kept locally), so this would be a new request plus a site change. The failure email covers the need.
- [x] Gate: all repo gates (CLAUDE.md) + `python backend/build.py`; put `Code.gs` on Yair's clipboard (`Get-Content -Raw backend\Code.gs | Set-Clipboard`) and tell him: paste, deploy a new version, then run **enableAlerts** once from the sheet menu (re-installs the trigger and asks for any new permission).
  - 15/10/2026: all 16 gates green; Code.gs on Yair's clipboard.
- [ ] Live check (after Yair's deploy + **enableAlerts**): the organizers' sheet's Drive `modifiedTime` moves within 2 hours, and no failure email arrives (or, if one does, its error is the next fix)
