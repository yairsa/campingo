# CampinGo — plan

> **Open questions for Yair** (hand-kept): none open (§4.4's go-ahead answered 14/10/2026). His 13/10/2026 answers are in §1.

**Status:** §4.1–4.4 done and live 14/10/2026 at https://yairsa.github.io/campingo/ (merge `235bb74`); the old address forwards. Left: Yair's backend deploy of the new `Code.gs`. §4.5 (the wordmark, the camp by day/night, 3D buttons) live 15/10/2026 (merge `99938fb`).

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
- [x] `gh repo rename campingo` (in the main checkout); confirm `git remote -v` points at `yairsa/campingo`; Pages serves `https://yairsa.github.io/campingo/` (14/10/2026; the remote was updated by `gh`, Pages kept `main` /)
- [x] Forwarding repo `yairsa/achziv-camping-calculator` (new, public, Pages on `main`): `index.html` + `admin.html` + `404.html` that replace `location` with the same path, query and hash under `/campingo/` (meta refresh as the no-JS fallback)
  - The page's source is `forwarder/index.html` in this repo (written 14/10/2026); publish it as all three files.
- [x] `share.js` `LIVE`, `tests/tour.e2e.js`, `README.md`, `CLAUDE.md`, `backend/SETUP.md` point at the new address (on the branch)
- [x] Gate: old link `…/achziv-camping-calculator/#gear` lands on `…/campingo/#gear` (headless, live); a crawler run still pushes (`git push --dry-run` from the main checkout) — both passed 14/10/2026; the old `admin.html` forwards too

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
<Yair: Land it> The design is built and green on `feat/campingo` (screenshots sent 14/10/2026). Landing renames the repo, makes the old address forward, and puts the new home page live for the families. Land it, or change something first?
  - **Answered 14/10/2026 (AskUserQuestion): "Land it".**
- [x] Merge `feat/campingo` to `main` together with §4.1's rename; live check on the new address (home, a button, an old link forwarding) — `235bb74`, live 14/10/2026: home shows חאן בארות 12/11 עד 14/11/2026, gear opens and → ראשי returns, old links forward
  - `Code.gs` put on Yair's clipboard 14/10/2026 (the calc tour); his deploy. Until he deploys, the site shows the built-in calculator tour texts.
- [x] Gate: live check passes; `docs/campsites-plan.md` and `CLAUDE.md` name the new address

#### 4.5 The tent in the wordmark (Yair, 14/10/2026)
> *"i love the campingo tent sybol, in header https://yairsa.github.io/campingo/#calc — it should also be in the main page. lets try adding the tent inside the text itself: Camp<tent looking like In>Go. the I is a landing flag? a camp lamp? something else?"*
- [x] Wordmark variants: "Camp" + an inline SVG where the tent shape forms the "n" and a tall slim element forms the "i" (try 3: a flag on a pole, a camp lantern, a tent peg/pole with the sun as the i's dot, reusing the logo's `--sun`), + "Go"; keep an accessible name "CampinGo" (`aria-label` / visually hidden text). Screenshots of all 3 at 360px and desktop, light and dark, sent to Yair to pick
  - Built 13/10/2026 on `feat/wordmark` (`index.html`: the i is `#wm-i-*` (peg, flag, lamp, flame, star, moon, pine), the tent `#wm-tent-a|dome`; a `<use>` clone ignores document selectors, so each variant is its own symbol). First sheet (3 options) sent; Yair asked for more (14/10/2026): an 11-row sheet sent. Waiting on his pick (recommended: a dome tent, which reads as an n; the A-frame reads as a Λ).
  - **Yair's pick, 14/10/2026:** *"pine tree as the pole, sun (light mode) moon (dark) is the dot, and dome. build a tweaking ui for me to modify sizes, dimentions (also the dual dome color, dark width etc)"*. The tuner is `tools/wordmark-tuner.html` (not part of the site); its Save downloads `wordmark-settings.json` to his Downloads, which the next box turns into `#wm-i-pine` / `#wm-tent-dome`. In the site the sun/moon swap must go through CSS custom properties: a `<use>` clone ignores selectors that depend on its ancestors, including the dark-mode ones.
  - Today: the logo is `.brand-logo` (header, hidden on home by `body[data-view="home"] .brand { visibility: hidden }`); the hero title is plain text `#home-title`.
  - Yair's tuned numbers (14/10/2026) are `tools/wordmark-settings.json`; then *"in logo, make equal spaces between characters"*: every gap (p→tree, tree→tent, tent→G) is 9 units, the font's own average ink gap (C-a 6, a-m 11.4, m-p 11.3, G-o 8.5).
- [x] The page is the camp by day (light) and by night (dark) (Yair, 14/10/2026: *"regarding the general page design, it should feel like the page is the camp at night(dark) /day (light mode) so a general "beem" of light should reflect on objects (night) / cast shadows (day)"*): one light source for the whole page. By day, the sun sits high on the hero's side and every raised object (hexagons, cards, buttons) casts a shadow away from it. By night, the moon or a lantern glow lights the edges of objects facing it, as a rim of light. The 3D buttons below take their shading from this light. Screenshots in a Chrome tab for Yair
- [x] Buttons look 3D, with a glow (Yair, 14/10/2026: *"also i want the button design etc look some 3d, with glow"*): the hive hexagons first (bevel/gradient, depth shadow via `filter: drop-shadow` since `clip-path` cuts box-shadow, a soft glow on hover/focus), then the other buttons to match; light + dark; screenshots with the wordmark variants
- [x] The chosen wordmark on the home page (`#home-title`) and in the header `.brand` on views; `tests/layout.e2e.js` asserts the title by its accessible name, not `textContent`
  - Done `c8307ee`; Yair approved it 14/10/2026 (*"only remove the רשימת ציוד button glow, and go live"*). The hexagons have no hover glow (`f9824ff`): on a phone a tap leaves the hover on. The other buttons keep theirs.
- [x] Gate: all repo gates + `stamp.py`; land on `main` (pushes live); live check: merge `99938fb`, live after ~70s on 15/10/2026; headless 360px light + dark: no errors, no sideways scroll, the h1 named "CampinGo", the sun by day and the moon by night; the old address still forwards
