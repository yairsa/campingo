# Crawler

Reads the Israel Nature and Parks Authority (RTG) night campsites and writes `data/*.json` + `data/*.js` for the site.
Plan: `docs/campsites-plan.md`.

## Setup (once)
```
python -m pip install playwright beautifulsoup4 tzdata
```
No `playwright install`: it drives the installed Chrome (`channel="chrome"`, headless). parks.org.il and
secure-hotels.net answer 403 to plain HTTP and to headless Chrome's default user agent, so the crawler sets a normal one.

## Commands
```
python crawler/crawl.py catalog                                   # 18 campsites: booking id, name, region, info URL
python crawler/crawl.py info [--only 13]                          # facilities, hours, directions, contact, price tabs, rates
python crawler/crawl.py availability --campsite 13 --in 2026-11-12 --out 2026-11-14 [--comp 2,3,0 ...]
python crawler/crawl.py run [--force] [--no-git]                  # what the scheduled task runs
python crawler/test_crawl.py                                      # offline tests on crawler/fixtures/
```
`--comp` is adults,children,infants (repeatable). Default compositions: 2,2,0 · 2,3,0 · 2,3,1.

`run` refreshes catalog + info when `data/campsites.json` is older than 20h (or `--force`), then reads availability for
the trip in `trip.json` (skipped once the trip has ended), writes `data/`, and commits + pushes `data/` only when something
changed other than `checkedAt` timestamps. One exception: when the committed timestamp is older than 36h it commits a
refresh anyway, so the site's "data older than 3 days" flag only fires when the crawler really stopped.
A timestamp-only run puts HEAD's copy of `data/` back, so the scheduled task never leaves the tree dirty.
It commits only when the checkout is on `main`; on any other branch the run logs an error and leaves `data/` modified.

A run is about 23 pages (2 catalog + 18 info + 3 availability), sequential, 3-5 s apart, never more than 25.
Each page gets a fresh browser context: reusing one made Cloudflare answer 403 from the second booking page on.

## Monitoring
Every run appends a line to `crawler/runs.log` (time, pages, changed y/n, errors) and exits 1 with the errors listed when
something failed. A campsite whose page fails keeps its last good data and gets an `errors` entry; `warnings` are softer
(e.g. no tent rate found).

## Scheduled task
`powershell -ExecutionPolicy Bypass -File crawler\install-task.ps1` registers "CampWebsite crawler": daily 05:30, repeating
every 6 hours, hidden (`pythonw.exe`, no focus). Remove: `Unregister-ScheduledTask -TaskName "CampWebsite crawler" -Confirm:$false`.

## Data shape
`data/campsites.json`: `{checkedAt, source, campsites: [{id, bookingId, name, shortName, region, url, bookingUrl, checkedAt,
facilities[], serviceHours, hours{summer, winter, checkout, entry, other[]}, directions, waze, contact{phone, email, whatsapp},
rentals[{label, price, note}], notes[], priceTabs{tab: [{label, price, note}]}, rates{adult, child, matmonAdult, matmonChild,
reserveAdult, reserveChild, soldier, student, senior, idfDisabled, groupAdult, groupChild}, ages{adult, child}, lodging[], warnings[], errors[]}]}`
sorted by region then name. `data/availability.json`: `{checkedAt, results: {"<id>|<in>|<out>": {checkedAt, comps: [{comp{adults,
children, infants}, lodging: [{name, fromPerNight, rates: [{label, total}]}], soldOutHint, url}]}}}`. A lodging type missing from
`lodging` is sold out for that composition; `soldOutHint` is true when nothing is listed.
