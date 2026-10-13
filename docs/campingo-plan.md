# CampinGo — plan

> **Open questions for Yair** (hand-kept): §4.4 — go-ahead to land (rename + merge makes the new design live). His 13/10/2026 answers are in §1.

**Status:** §4.2 and §4.3 built on branch `feat/campingo` (worktree `../wt-campingo`), all gates green, 14/10/2026. Next: §4.1 + §4.4 together (the rename lands with the merge).

## 1. The brief (Yair, 13/10/2026)

> *"we need to change the site name/address - lets call it CampinGo. change the URL. lets try a different main page: site title, designed (currently basic), show our next planned camping destination & dates, and replace the tabs with buttons grid/hive. if date is already due, and no other camping is planned, just state that. buttons texts: מחירון, מחשבון, רשימת ציוד. a lower section for general issue: חניונים, טיפים לקמפינג"*

Answers, 13/10/2026 (AskUserQuestion):
- **Address:** `https://yairsa.github.io/campingo/`. The old address keeps a tiny page that forwards there (old links in the families' WhatsApp keep working).
- **על המקום and פעילויות are kept**, as trip buttons. Trip section: מחשבון · מחירון · רשימת ציוד · על המקום · פעילויות. General section: חניונים · טיפים לקמפינג.
- **Hive** (hexagon buttons in a honeycomb), not a square grid.

## 2. Facts (measured 13/10/2026)

- GitHub repo `yairsa/achziv-camping-calculator`, Pages from `main`. **GitHub Pages does not redirect after a repo rename** (git URLs do; `*.github.io/<old>` 404s). Hence the forwarding repo.
- localStorage is per origin (`yairsa.github.io`), not per path: saved registrations, the outbox and the tour state survive the move. The keys stay `achziv-*`; renaming them would lose every family's saved data.
- The old URL appears in `share.js` (`LIVE`), `tests/tour.e2e.js` (2 asserts), `README.md`, `CLAUDE.md`, `backend/SETUP.md` (admin link). The Apps Script backend does not check the origin.
- The scheduled crawler pushes `origin` from the main checkout; after the rename, `origin` must point at the new repo (`gh repo rename` updates the local remote of the checkout it runs in; check it).
- Tabs today: `#tab-calc` (the price list `#calc-prices` is a section inside it, opened by `#open-prices`; `#prices` deep link), `place`, `gear`, `acts`, `sites`, `tips`. `app.js` ~line 270 owns tab switching and fires `tabshown` (tour.js listens); `history` + hash per tab; `tests/layout.e2e.js` asserts the tab row; `tour.js` points at `[role=tab]`.

## 3. Decisions (derived: object if wrong)

| topic | decision | why |
|---|---|---|
| Where the work happens | Branch `feat/campingo` in worktree `../wt-campingo`; merge when §4.2–4.4 are green | The crawler pushes `main` every 6h |
| Order | The rename + forwarding (§4.1) lands **with** the new home (same merge), so the new address opens on the new design | One announcement for the families |
| Home | A new home view replaces the tab row: `CampinGo` title + tagline, a trip card (campsite name, dates "12/11 עד 14/11/2026", nights left / "בעוד N ימים"), then the trip hive, then a "כללי" hive | The brief |
| No trip | If today > `TRIP.to` and `trip.json` has no later trip: the card says there is no planned camping yet; the trip hive is hidden; the general hive stays | The brief: "just state that" |
| Navigation | Each button opens its view (the existing panels, unchanged inside) with a bar "→ ראשי" at the top. Hashes stay (`#calc`, `#prices`, `#place`, `#gear`, `#acts`, `#sites`, `#tips`; empty = home); the phone's back button returns home | Old shared links keep working; the panels' code and tests stay |
| מחירון | Its own button, opening the existing price list section (`#prices`) | Already a deep link |
| Tours | Welcome tour points at the home hive instead of the tab row; each view's tour still runs on first opening (`tabshown` keeps firing) | Least change to tour.js |
| Names | Visible name `CampinGo` (title, header, share text, manifest-free); storage keys unchanged | §2 |

## 4. Tasks

#### 4.1 Address: rename + forwarding
- [ ] `gh repo rename campingo` (in the main checkout); confirm `git remote -v` points at `yairsa/campingo`; Pages serves `https://yairsa.github.io/campingo/`
- [ ] Forwarding repo `yairsa/achziv-camping-calculator` (new, public, Pages on `main`): `index.html` + `admin.html` + `404.html` that replace `location` with the same path, query and hash under `/campingo/` (meta refresh as the no-JS fallback)
  - The page's source is `forwarder/index.html` in this repo (written 14/10/2026); publish it as all three files.
- [x] `share.js` `LIVE`, `tests/tour.e2e.js`, `README.md`, `CLAUDE.md`, `backend/SETUP.md` point at the new address (on the branch)
- [ ] Gate: old link `…/achziv-camping-calculator/#gear` lands on `…/campingo/#gear` (headless, live); a crawler run still pushes (`git push --dry-run` from the main checkout)

#### 4.2 Home page
- [x] Home view: `CampinGo` title, designed header (colors from `style.css` tokens, light + dark), the trip card from `TRIP` + `CAMPSITES`, the "no planned camping" state
  - `#home` in `index.html`; the card is filled by `place.js` (name, dates, nights, "בעוד N ימים" / "מחר!" / "אנחנו שם עכשיו!"). Waze and Maps moved into the card.
  - No trip = today after `TRIP.to`: `body.no-trip`, the trip hive and the card's details hidden. `window.CAMPINGO_TODAY` (ISO) overrides today; `tests/pin-trip.js` sets 2026-10-01.
  - New tokens `--hero-*`, `--sun`, `--hex*` in all three token blocks. The brand bar (logo, share, ?) is on every view; on the home page its name is hidden (the hero says it).
- [x] Hive: trip hexagons מחשבון · מחירון · רשימת ציוד · על המקום · פעילויות; general hexagons חניונים · טיפים לקמפינג; icons; keyboard + screen-reader labels; 360px fits without horizontal scroll
  - The hexagons keep the old ids (`#tab-calc` … plus `#tab-prices`): gear.js, tips.js and activities.js start on their click/focus. `clip-path` is on the button, so the overlapping rows' corners do not steal clicks; the focus ring is the hexagon's edge (an outline would be clipped).
- [x] Navigation: the tab row goes; a "→ ראשי" bar on each view; hashes and the back button as in §3
  - Router in `app.js` (`show`/`go`/`home`): each step is a history entry carrying its depth (`state.d`), so → ראשי is `history.go(-d)`. A link straight to a view (`#gear`) is opened over a home entry, so back stays on the site. `window.CampNav` for tour.js. `tabshown` fires on every panel change, `home` included.
  - The old tab-fitting CSS (`style.css` 520px block, `explorer.css` 420px block) removed: it squeezed the new bar.
- [x] Gate: all repo gates + `stamp.py`; 360px and desktop screenshots, light and dark (checked 14/10/2026)

#### 4.3 Tests and tours
- [x] `tests/layout.e2e.js` rewritten for home + hive (every button opens its view, back returns home, old hashes open their view, no-trip state with a shifted clock)
- [x] `tour.js` / `tour-texts.js`: welcome tour on the home hive; per-view tours unchanged; retired texts into `TOUR_RETIRED_`; `build.py` (Code.gs carries tour-texts: clipboard to Yair, his deploy)
  - Welcome (home): hello · help · the trip hive · מחירון · כללי (new step `general`) · share. The calculator's four steps became their own tour `calc` (sheet name מחשבון); `TOUR_MOVED_` + `tourSync_` move the sheet's rows, with any text Yair wrote, to the new tour.
  - A view's tour runs on its first opening; the welcome waits for the home page (a link to `#tips` shows the tips tour first). A visitor who saw the old welcome (`welcome` without `hive` in `achziv-tour-v1`) counts as having seen the calc tour.
  - Code.gs changed; it goes on Yair's clipboard at landing (§4.4), so his deploy matches the live site.
- [x] Every other e2e that clicks `#tab-*` goes through the home buttons (or a helper)
  - `tests/open-view.js`: → ראשי if on a view, then the hexagon.
- [x] Gate: all repo gates green (16/16, 14/10/2026)

#### 4.4 Land
<Yair: > The design is built and green on `feat/campingo` (screenshots sent 14/10/2026). Landing renames the repo, makes the old address forward, and puts the new home page live for the families. Land it, or change something first?
- [ ] Merge `feat/campingo` to `main` together with §4.1's rename; live check on the new address (home, a button, an old link forwarding)
  - Then `Code.gs` on Yair's clipboard (the calc tour); his deploy.
- [ ] Gate: live check passes; `docs/campsites-plan.md` and `CLAUDE.md` name the new address
