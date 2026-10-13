#!/usr/bin/env python
"""Crawler for the Israel Nature and Parks Authority (RTG) night campsites.

Reads the booking engine (campsite list), the parks.org.il info pages (facilities, hours, price tabs)
and the booking results page (live availability) and writes data/*.json + data/*.js for the site.

    python crawler/crawl.py catalog
    python crawler/crawl.py info [--only 13]
    python crawler/crawl.py availability --campsite 13 --in 2026-11-12 --out 2026-11-14
    python crawler/crawl.py run [--force] [--no-git]

The parse_* functions are pure (HTML in, dict out) so test_crawl.py runs them on saved pages, no network.
"""
import argparse
import json
import random
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TRIP_FILE = ROOT / "trip.json"
RUNS_LOG = Path(__file__).resolve().parent / "runs.log"

ENGINE_URL = "https://secure-hotels.net/INPA/BE_Engine.aspx?lang=heb&hotel=13_1"
INDEX_URL = "https://www.parks.org.il/camping/"
INFO_BASE = "https://www.parks.org.il/camping/"
RESULTS_BASE = "https://secure-hotels.net/INPA/BE_Results.aspx"
# Cloudflare / CloudFront refuse the default headless user agent
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

DEFAULT_COMPS = [(2, 2, 0), (2, 3, 0), (2, 3, 1)]
INFO_MAX_AGE_HOURS = 20
# the site flags data older than 3 days, so an unchanged crawl still commits a fresh timestamp this often
HEARTBEAT_HOURS = 36
# commits only on the live branch; on any other checkout the run logs an error instead
BRANCH = "main"
MAX_PAGES = 25


# ---------------------------------------------------------------- small helpers

def now_iso():
    """Current time with the Israel offset (+02:00 / +03:00)."""
    try:
        tz = ZoneInfo("Asia/Jerusalem")
        return datetime.now(tz).isoformat(timespec="seconds")
    except Exception:
        return datetime.now().astimezone().isoformat(timespec="seconds")


def parse_iso(s):
    return datetime.fromisoformat(s)


def clean(s):
    """Collapse whitespace; drop the invisible zero-width / direction marks the CMS leaves inside words."""
    s = re.sub(r"[​-‏‪-‮﻿]", "", s or "")
    return re.sub(r"\s+", " ", s).strip()


def to_number(text):
    """'64.00 ₪' -> 64, '1,720' -> 1720, '12.5' -> 12.5; None when there is no number."""
    m = re.search(r"\d[\d,]*(?:\.\d+)?", text or "")
    if not m:
        return None
    n = float(m.group(0).replace(",", ""))
    return int(n) if n == int(n) else n


def soup_of(html):
    s = BeautifulSoup(html, "html.parser")
    for t in s(["script", "style", "noscript"]):
        t.decompose()
    return s


def strip_checked(obj):
    """Copy of obj without any 'checkedAt' key, to compare data ignoring timestamps."""
    if isinstance(obj, dict):
        return {k: strip_checked(v) for k, v in obj.items() if k != "checkedAt"}
    if isinstance(obj, list):
        return [strip_checked(v) for v in obj]
    return obj


# ---------------------------------------------------------------- catalog

GENERIC = {"חניון", "לילה", "גן", "לאומי", "שמורת", "טבע", "אתר", "חוות"}


def name_tokens(text):
    """Comparable tokens of a campsite name or slug: generic words dropped, article and vav/yod removed."""
    out = set()
    for w in re.findall(r"[א-ת]+", text or ""):
        if w in GENERIC:
            continue
        if len(w) > 3 and w.startswith("ה"):
            w = w[1:]
        w = re.sub(r"[וי]", "", w)  # spelling varies: יוטבתה / יטבתה
        if w:
            out.add(w)
    return out


def parse_engine(html):
    """Engine page -> [{bookingId, name, shortName, region}] (hidden #settings JSON)."""
    s = BeautifulSoup(html, "html.parser")
    el = s.find(id="settings")
    if el is None or not el.get("value"):
        raise ValueError("engine page has no #settings JSON")
    settings = json.loads(el["value"])
    out = []
    for region in settings["Regions"]:
        for r in region.get("Resorts", []):
            name = clean(r["ResortName"])
            out.append({
                "bookingId": int(r["OptimaResortID"]),
                "name": name,
                "shortName": re.sub(r"^חניון לילה\s+", "", name),
                "region": clean(region["RegionName"]),
            })
    return out


def parse_camping_index(html):
    """parks.org.il/camping/ -> sorted unique slugs of the /camping/<slug>/ links."""
    s = BeautifulSoup(html, "html.parser")
    slugs = set()
    for a in s.find_all("a", href=True):
        m = re.search(r"/camping/([^/?#]+)/?", urllib.parse.unquote(a["href"]))
        if m:
            slugs.add(m.group(1))
    return sorted(slugs)


def match_slugs(campsites, slugs):
    """Add `url` to each campsite by matching its name to a slug. Fails loudly unless all match one-to-one."""
    slug_tokens = {sl: name_tokens(sl) for sl in slugs}
    used = {}
    problems = []
    for c in campsites:
        et = name_tokens(c["name"])
        scored = sorted(
            ((len(et & st), -len(st - et), sl) for sl, st in slug_tokens.items()),
            reverse=True)
        best = scored[0]
        second = scored[1] if len(scored) > 1 else (0, 0, "")
        if best[0] == 0 or (best[0], best[1]) == (second[0], second[1]):
            problems.append(f"{c['bookingId']} {c['name']}: no clear match (best {best[2]})")
            continue
        slug = best[2]
        if slug in used:
            problems.append(f"{c['bookingId']} {c['name']}: slug {slug} also taken by {used[slug]}")
            continue
        used[slug] = c["bookingId"]
        c["url"] = INFO_BASE + slug + "/"
    if problems:
        raise ValueError("campsite to info-page matching failed:\n  " + "\n  ".join(problems))
    return campsites


def build_catalog(engine_html, index_html):
    campsites = parse_engine(engine_html)
    slugs = parse_camping_index(index_html)
    match_slugs(campsites, slugs)
    for c in campsites:
        c["id"] = c["bookingId"]
        c["bookingUrl"] = f"{RESULTS_BASE}?lang=heb&hotel={c['bookingId']}"
    campsites.sort(key=lambda c: (c["region"], c["name"]))
    return campsites


# ---------------------------------------------------------------- info page

TAB_KEYS = [  # (substring of the tab name, key)
    ("רגיל", "regular"), ("מנוי", "matmon"), ("חייל", "soldier"), ("מילואים", "reserve"),
    ("קבוצה", "group"), ("אזרח ותיק", "senior"), ("סטודנט", "student"),
    ("נכה", "idfDisabled"), ("ציוד", "rentals"),
]
TENT_RE = re.compile(r"לינת שטח|אוהלים פרטיים|אוהל פרטי")
RATE_KEYS = ["adult", "child", "matmonAdult", "matmonChild", "reserveAdult", "reserveChild", "soldier",
             "student", "senior", "idfDisabled", "groupAdult", "groupChild"]


def tab_key(name):
    for part, key in TAB_KEYS:
        if part in name:
            return key
    return None


def parse_price_tabs(soup):
    """{tabName: [{label, price, note}]}: every tab is in the HTML, only the active one is visible."""
    names = {}
    for sp in soup.find_all("span", class_="tableTab"):
        names[sp.get("data-id")] = clean(sp.get_text())
    tabs = {}
    for box in soup.find_all("div", class_="tableMain"):
        name = names.get(box.get("data-id"), "tab " + str(box.get("data-id")))
        rows = []
        for tr in box.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 2:
                continue
            price = to_number(tds[1].get_text())
            if price is None:
                continue
            note = clean(tds[2].get("data-content") or "") if len(tds) > 2 else ""
            rows.append({"label": clean(tds[0].get_text()), "price": price, "note": note})
        tabs[name] = rows
    return tabs


def tent_prices(rows):
    """Tent rows of one tab -> (adult, child, single). `single` is the first tent price (tabs without ages)."""
    adult = child = single = None
    for r in rows:
        if not TENT_RE.search(r["label"]):
            continue
        if single is None:
            single = r["price"]
        if "מבוגר" in r["label"] and adult is None:
            adult = r["price"]
        elif "ילד" in r["label"] and child is None:
            child = r["price"]
    return adult, child, single


def normalise_rates(tabs):
    """Map the price tabs to the calculator's category ids (null where the campsite has no such rate)."""
    by_key = {}
    for name, rows in tabs.items():
        k = tab_key(name)
        if k:
            by_key[k] = rows
    rates = {k: None for k in RATE_KEYS}
    adult, child, _ = tent_prices(by_key.get("regular", []))
    rates["adult"], rates["child"] = adult, child
    adult, child, _ = tent_prices(by_key.get("matmon", []))
    rates["matmonAdult"], rates["matmonChild"] = adult, child
    adult, child, _ = tent_prices(by_key.get("reserve", []))
    rates["reserveAdult"], rates["reserveChild"] = adult, child
    adult, child, _ = tent_prices(by_key.get("group", []))
    rates["groupAdult"], rates["groupChild"] = adult, child
    for key, rate in (("soldier", "soldier"), ("student", "student"), ("senior", "senior"),
                      ("idfDisabled", "idfDisabled")):
        rates[rate] = tent_prices(by_key.get(key, []))[2]
    return rates


def lines_of(tag):
    """Text lines of a paragraph, split at <br>."""
    for br in tag.find_all("br"):
        br.replace_with("\n")
    return [clean(x) for x in tag.get_text(" ").split("\n") if clean(x)]


def parse_facilities(soup):
    """(facilities, serviceHours) from the 'מה בחניון?' block. Sub-areas (h4) prefix their items."""
    facilities, service_hours = [], None
    head = next((h for h in soup.find_all("h3") if "מה בחניון" in clean(h.get_text())), None)
    block = head.parent if head else None
    if block is None:
        return facilities, service_hours
    section = None
    for ch in block.find_all(["h4", "ul", "p"], recursive=False):
        if ch.name == "h4":
            section = clean(ch.get_text())
        elif ch.name == "ul":
            if section and "ציוד להשכרה" in section:
                continue
            prefix = ""
            if section and "מרכז שירות" not in section:
                prefix = section + ": "
            facilities += [prefix + clean(li.get_text()) for li in ch.find_all("li") if clean(li.get_text())]
        elif ch.name == "p" and section and "מרכז שירות" in section:
            text = re.sub(r"^שעות פתיחה:\s*", "", clean(ch.get_text()))
            service_hours = (service_hours + " " + text) if service_hours else text
    return facilities, service_hours


def parse_hours(soup):
    out = {"summer": None, "winter": None, "checkout": None, "entry": None, "other": []}
    ed = soup.select_one(".openHour .editor")
    if ed is None:
        return out
    season = None
    for ch in ed.find_all(["h4", "p"], recursive=False):
        if ch.name == "h4":
            t = clean(ch.get_text())
            season = "summer" if "קיץ" in t else "winter" if "חורף" in t else None
            continue
        for line in lines_of(ch):
            if "יש לפנות" in line:
                out["checkout"] = line
            elif season and "הכניסה" in line:
                out[season] = (out[season] + " " + line) if out[season] else line
            elif out["entry"] is None and "הכניסה לחניון" in line:
                out["entry"] = line
            else:
                out["other"].append(line)
    return out


def parse_contact(soup):
    arrive = soup.select_one(".infoArrive")
    out = {"phone": None, "email": None, "whatsapp": None}
    if arrive is None:
        return out
    wa = arrive.find("a", href=re.compile(r"wa\.me|whatsapp"))
    if wa:
        out["whatsapp"] = wa["href"]
    text = clean(arrive.get_text(" "))
    tel = arrive.find("a", href=re.compile(r"^tel:"))
    span = next((s for s in arrive.find_all("span", class_="holidHour") if clean(s.get_text()).startswith("טלפון")), None)
    if tel:
        out["phone"] = clean(tel.get_text())
    elif span is not None:
        for a in span.find_all("a", href=re.compile(r"wa\.me|whatsapp")):
            a.decompose()  # the national info line's chat link, not a number
        t = re.sub(r"^טלפון:?\s*", "", clean(span.get_text(" ")))
        out["phone"] = t.strip(" ,") or None
    mail = arrive.find("a", href=re.compile(r"^mailto:"))
    if mail:
        out["email"] = mail["href"][7:]
    else:
        m = re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text)
        if m:
            out["email"] = m.group(0)
    return out


def parse_info(html):
    """One campsite info page -> info fields (see the README for the shape)."""
    soup = soup_of(html)
    errors = []
    facilities, service_hours = parse_facilities(soup)
    if not facilities:
        errors.append("no facilities list found")
    tabs = parse_price_tabs(soup)
    if not tabs:
        errors.append("no price tabs found")
    answer = soup.select_one(".infoArrive .answer")
    directions = clean(answer.get_text(" ")) if answer else None
    waze = None
    cs = soup.select_one(".infoArrive .contactSpace")
    if cs:
        waze = clean(re.sub(r"^\s*כתבו בוויז:?", "", cs.get_text(" "))) or None

    by_key = {tab_key(n): rows for n, rows in tabs.items() if tab_key(n)}
    regular = by_key.get("regular", [])
    rates = normalise_rates(tabs)
    warnings = []
    if rates["adult"] is None and tabs:
        warnings.append("no tent adult rate in the regular tab")
    # the notes on the tent rows carry the age bands (e.g. 'גיל 18 ומעלה')
    ages = {"adult": None, "child": None}
    for r in regular:
        if TENT_RE.search(r["label"]):
            if "מבוגר" in r["label"] and not ages["adult"]:
                ages["adult"] = r["note"] or None
            elif "ילד" in r["label"] and not ages["child"]:
                ages["child"] = r["note"] or None
    notes = []
    for r in regular:
        if r["note"] and r["note"] not in notes and len(r["note"]) <= 200:
            notes.append(r["note"])
    return {
        "facilities": facilities,
        "serviceHours": service_hours,
        "hours": parse_hours(soup),
        "directions": directions,
        "waze": waze,
        "contact": parse_contact(soup),
        "rentals": by_key.get("rentals", []),
        "notes": notes,
        "priceTabs": tabs,
        "rates": rates,
        "ages": ages,
        "lodging": [{"label": r["label"], "price": r["price"], "note": r["note"]}
                    for r in regular if not TENT_RE.search(r["label"])],
        "warnings": warnings,
        "errors": errors,
    }


# ---------------------------------------------------------------- booking results page

def results_url(campsite_id, check_in, check_out, comp):
    adults, children, infants = comp
    return (f"{RESULTS_BASE}?lang=heb&hotel={campsite_id}&in={check_in}&out={check_out}"
            f"&rooms=1&ad1={adults}&ch1={children}&inf1={infants}")


def parse_results(html):
    """BE_Results page -> one entry per composition on the page: [{lodging: [...], soldOutHint}].

    A lodging type missing from the list means sold out for that composition; when nothing is listed
    the page shows its 'אזל מהמלאי' hint, which is also in the page text when results exist, so the flag
    is derived from the empty list rather than from the text."""
    soup = soup_of(html)
    if soup.select_one("div.order-details") is None:
        # not the results page (challenge, error, empty): never report that as 'sold out'
        raise ValueError("unexpected page: no order summary (challenge or error page?)")
    comps = []
    for holder in soup.select("div.roomListShow, div.roomListHidden"):
        lodging = []
        for rc in holder.select("div.roomcategory"):
            name = rc.select_one(".roomname")
            if name is None:
                continue
            minp = rc.select_one(".asof-room-price .PriceD")
            rates = []
            for pc in rc.select("div.pricecode"):
                label = pc.select_one(".cutSpan")
                price = pc.select_one(".planPriceToCurrency .PriceD") or pc.select_one(".oldPlanPrice .PriceD")
                if label is None or price is None:
                    continue
                rates.append({"label": clean(label.get_text()), "total": to_number(price.get_text())})
            lodging.append({
                "name": clean(name.get_text()),
                "fromPerNight": to_number(minp.get_text()) if minp else None,
                "rates": rates,
            })
        comps.append({"lodging": lodging, "soldOutHint": not lodging})
    if not comps:
        comps.append({"lodging": [], "soldOutHint": True})
    return comps


# ---------------------------------------------------------------- browser

class Crawler:
    """One headless Chrome, sequential page loads with a polite pause between them."""

    def __init__(self, max_pages=MAX_PAGES, pause=(3, 5)):
        self.max_pages = max_pages
        self.pause = pause
        self.pages = 0
        self._pw = self._browser = None

    def __enter__(self):
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(channel="chrome", headless=True)
        return self

    def __exit__(self, *exc):
        try:
            self._browser.close()
        except Exception:
            pass
        if self._pw:
            self._pw.stop()

    def get(self, url, wait_selector=None):
        if self.pages >= self.max_pages:
            raise RuntimeError(f"page limit {self.max_pages} reached, not loading {url}")
        if self.pages:
            time.sleep(random.uniform(*self.pause))
        self.pages += 1
        # a fresh context (no cookies) per page: reusing the booking site's session made Cloudflare
        # answer 403 from the second results page on
        ctx = self._browser.new_context(user_agent=USER_AGENT, locale="he-IL")
        try:
            page = ctx.new_page()
            page.goto(url, wait_until="networkidle", timeout=60000)
            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=15000)
                except Exception:
                    pass  # no rooms listed is a valid answer
            return page.content()
        finally:
            ctx.close()


# ---------------------------------------------------------------- data files

def write_js(path, var, obj):
    path.write_text(f"window.{var} = " + json.dumps(obj, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


def write_data(name, var, obj):
    DATA.mkdir(exist_ok=True)
    (DATA / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_js(DATA / f"{name}.js", var, obj)


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_campsites(campsites):
    campsites = sorted(campsites, key=lambda c: (c["region"], c["name"]))
    write_data("campsites", "CAMPSITES", {
        "checkedAt": now_iso(),
        "source": "https://www.parks.org.il/camping/ + https://secure-hotels.net/INPA/",
        "campsites": campsites,
    })


def load_trip():
    t = load_json(TRIP_FILE)
    if not t:
        raise SystemExit(f"{TRIP_FILE} missing or unreadable")
    return t


# ---------------------------------------------------------------- commands

KEY_ORDER = ["id", "bookingId", "name", "shortName", "region", "url", "bookingUrl", "checkedAt", "facilities",
             "serviceHours", "hours", "directions", "waze", "contact", "rentals", "notes", "priceTabs",
             "rates", "ages", "lodging", "warnings", "errors"]


def ordered(rec):
    out = {k: rec[k] for k in KEY_ORDER if k in rec}
    out.update({k: v for k, v in rec.items() if k not in out})
    return out


def do_catalog(crawler):
    engine = crawler.get(ENGINE_URL)
    index = crawler.get(INDEX_URL)
    fresh = build_catalog(engine, index)
    old = {c["id"]: c for c in (load_json(DATA / "campsites.json") or {}).get("campsites", [])}
    merged = []
    for c in fresh:
        prev = old.get(c["id"], {})
        merged.append(ordered({**prev, **c}))  # keep info fields from the last info run
    save_campsites(merged)
    return merged


def do_info(crawler, only=None):
    data = load_json(DATA / "campsites.json")
    if not data or not data.get("campsites"):
        raise SystemExit("no data/campsites.json: run `crawl.py catalog` first")
    campsites = data["campsites"]
    for c in campsites:
        if only is not None and c["id"] != only:
            continue
        try:
            info = parse_info(crawler.get(c["url"]))
        except Exception as e:  # one campsite never stops the others
            info = {"errors": [f"{type(e).__name__}: {e}"]}
        # a failed page keeps the last good info next to the new error
        c.update(info)
        c["checkedAt"] = now_iso()
        print(f"  {c['id']:>3} {c['shortName']}: " +
              ("ERRORS " + "; ".join(c["errors"]) if c.get("errors") else "ok"))
    campsites = [ordered(c) for c in campsites]
    save_campsites(campsites)
    return campsites


def do_availability(crawler, campsite_id, check_in, check_out, comps):
    results = []
    errors = []
    for comp in comps:
        url = results_url(campsite_id, check_in, check_out, comp)
        try:
            parsed = parse_results(crawler.get(url, wait_selector="div.roomcategory"))[0]
        except Exception as e:
            errors.append(f"{campsite_id} {comp}: {type(e).__name__}: {e}")
            continue
        results.append({"comp": {"adults": comp[0], "children": comp[1], "infants": comp[2]},
                        "lodging": parsed["lodging"], "soldOutHint": parsed["soldOutHint"], "url": url})
    return results, errors


def save_availability(campsite_id, check_in, check_out, comps):
    """Merge one result into data/availability.*, dropping stays that already ended."""
    prev = load_json(DATA / "availability.json") or {}
    today = date.today().isoformat()
    kept = {}
    for key, val in (prev.get("results") or {}).items():
        if key.split("|")[2] >= today:
            kept[key] = val
    kept[f"{campsite_id}|{check_in}|{check_out}"] = {"checkedAt": now_iso(), "comps": comps}
    write_data("availability", "AVAILABILITY", {"checkedAt": now_iso(), "results": dict(sorted(kept.items()))})


def parse_comp(text):
    parts = [int(x) for x in text.split(",")]
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("--comp is adults,children,infants (e.g. 2,3,0)")
    return tuple(parts)


# ---------------------------------------------------------------- git

def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, encoding="utf-8")


def data_changed_beyond_timestamps():
    """True when staged data differs from HEAD in more than `checkedAt` values (or is new)."""
    names = git("diff", "--cached", "--name-only", "--", "data").stdout.split()
    changed = []
    for n in names:
        if not n.endswith(".json"):
            continue
        head = git("show", f"HEAD:{n}")
        if head.returncode != 0:
            changed.append(n)  # new file
            continue
        new = load_json(ROOT / n)
        if strip_checked(json.loads(head.stdout)) != strip_checked(new):
            changed.append(n)
    return changed


def heartbeat_due():
    """True when the committed campsites.json timestamp is older than HEARTBEAT_HOURS."""
    head = git("show", "HEAD:data/campsites.json")
    if head.returncode != 0:
        return True
    try:
        at = parse_iso(json.loads(head.stdout)["checkedAt"])
        return datetime.now(at.tzinfo) - at > timedelta(hours=HEARTBEAT_HOURS)
    except Exception:
        return True


def commit_and_push():
    """Commit + push data/ only on a real change, and only from BRANCH. Returns (changed, error).

    A run with nothing new puts HEAD's copy of data/ back, so the scheduled task never leaves the tree dirty.
    """
    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    git("add", "data")
    changed = data_changed_beyond_timestamps()
    reason = "data changed: " + ", ".join(Path(c).name for c in changed) if changed else None
    if not changed and heartbeat_due():
        reason = "timestamp refresh"
        changed = ["timestamp"]
    if not changed:
        names = git("diff", "--cached", "--name-only", "--", "data").stdout.split()
        git("reset", "-q", "--", "data")
        if names:  # timestamp-only edits
            git("checkout", "-q", "--", *names)
        return False, None
    if branch != BRANCH:
        git("reset", "-q", "--", "data")
        return False, f"not committed: the checkout is on '{branch}', not '{BRANCH}' (data/ left modified)"
    msg = f"crawler: {reason}"
    c =git("commit", "-q", "-m", msg, "--", "data")
    if c.returncode != 0:
        return True, "git commit failed: " + (c.stderr or c.stdout).strip()
    p = git("push")
    if p.returncode != 0:
        return True, "git push failed: " + (p.stderr or p.stdout).strip()
    return True, None


# ---------------------------------------------------------------- run

def cmd_run(args):
    errors = []
    started = datetime.now()
    data = load_json(DATA / "campsites.json")
    stale = True
    if data and data.get("checkedAt") and not args.force:
        age = datetime.now(parse_iso(data["checkedAt"]).tzinfo) - parse_iso(data["checkedAt"])
        stale = age > timedelta(hours=INFO_MAX_AGE_HOURS)
    trip = load_trip()
    avail_needed = date.today().isoformat() <= trip["to"]
    pages = 0
    avail_note = "trip over"
    with Crawler() as crawler:
        if stale or args.force:
            print("catalog + info ...")
            try:
                do_catalog(crawler)
                campsites = do_info(crawler)
                for c in campsites:
                    errors += [f"{c['id']} {c['shortName']}: {e}" for e in c.get("errors", [])]
            except Exception as e:
                errors.append(f"catalog/info: {type(e).__name__}: {e}")
        if avail_needed:
            print("availability ...")
            comps, errs = do_availability(crawler, trip["campsiteId"], trip["from"], trip["to"], DEFAULT_COMPS)
            errors += errs
            if comps:
                save_availability(trip["campsiteId"], trip["from"], trip["to"], comps)
            avail_note = f"{len(comps)} comps"
        pages = crawler.pages
    changed = False
    if not args.no_git:
        changed, err = commit_and_push()
        if err:
            errors.append(err)
    line = (f"{started.isoformat(timespec='seconds')} · pages {pages} · info {'yes' if stale else 'skipped'} · "
            f"availability {avail_note} · changed {'y' if changed else 'n'}"
            f"{' (git off)' if args.no_git else ''} · errors {len(errors)}"
            + ("".join(f"\n    ! {e}" for e in errors)))
    with RUNS_LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line)
    if errors:
        print(f"FAILED: {len(errors)} error(s), see above and crawler/runs.log", file=sys.stderr)
        return 1
    return 0


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("catalog")
    p = sub.add_parser("info")
    p.add_argument("--only", type=int, help="booking id of one campsite")
    p = sub.add_parser("availability")
    p.add_argument("--campsite", type=int, required=True)
    p.add_argument("--in", dest="check_in", required=True)
    p.add_argument("--out", dest="check_out", required=True)
    p.add_argument("--comp", type=parse_comp, action="append", help="adults,children,infants (repeatable)")
    p = sub.add_parser("run")
    p.add_argument("--force", action="store_true", help="refresh catalog + info even if recent")
    p.add_argument("--no-git", action="store_true", help="write files, do not commit or push")
    args = ap.parse_args(argv)

    if args.cmd == "run":
        return cmd_run(args)
    with Crawler() as crawler:
        if args.cmd == "catalog":
            cs = do_catalog(crawler)
            print(f"{len(cs)} campsites written to {DATA}")
        elif args.cmd == "info":
            do_info(crawler, args.only)
        else:
            comps, errs = do_availability(crawler, args.campsite, args.check_in, args.check_out,
                                          args.comp or DEFAULT_COMPS)
            if comps:
                save_availability(args.campsite, args.check_in, args.check_out, comps)
            print(json.dumps(comps, ensure_ascii=False, indent=2))
            for e in errs:
                print("ERROR", e, file=sys.stderr)
            return 1 if errs else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
