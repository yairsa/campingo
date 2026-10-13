// Run: node tests/booking.e2e.js — the "הזמנה ברט״ג" panel (booking.js) in headless Chrome at 360px.
// Pinned to the Achziv trip (campsite 23, 06/10 to 13/10, tests/pin-trip.js). The crawler's snapshot is injected for
// that trip (data/availability.js only holds the current trip). The Google URL is mocked: the public summary only.
// Needs playwright-core (PLAYWRIGHT_CORE=<path>, default: the website repo's copy) and installed Chrome (CHROME=<path>).
const assert = require('assert'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/YairSahar_Business/ParentingUpClose_Website/node_modules/playwright-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const SNAP = { checkedAt: '2026-10-13T18:14:47+03:00', results: { '23|2026-10-06|2026-10-13': { checkedAt: '2026-10-13T18:14:47+03:00', comps: [
  { comp: { adults: 2, children: 0, infants: 0 }, lodging: [
    { name: 'לינת שטח באוהלים פרטיים', fromPerNight: 152, rates: [{ label: 'מחיר רגיל', total: 1064 }, { label: 'מטמון', total: 800 }] },
    { name: 'מאהל גדול קבוע', fromPerNight: 860, rates: [{ label: 'מאהל', total: 6020 }] }] },
  { comp: { adults: 2, children: 3, infants: 0 }, lodging: [] }] } } };
// the public summary: names, families, people per night (summary_ in backend/Code.source.gs). No compositions.
const SUMMARY = { ok: true, families: 3, names: ['כהן', 'לוי', 'מזרחי'], nights: { '2026-10-06': 9, '2026-10-07': 11, '2026-10-08': 7 } };
const BASE = 'https://secure-hotels.net/INPA/BE_Results.aspx?lang=heb&hotel=23&in=2026-10-06&out=2026-10-13';
const q = (n, c) => `&ad${n}=${c[0]}&ch${n}=${c[1]}&inf${n}=${c[2]}`;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
  await require('./pin-trip')(page);
  await page.addInitScript((snap) => { window.ACHZIV_NOTOUR = 1; window.__snap = snap; }, SNAP);
  // data/availability.js assigns window.AVAILABILITY; put the Achziv snapshot over it after load
  await page.addInitScript(() => {
    let v; Object.defineProperty(window, 'AVAILABILITY', { configurable: true, get: () => v, set: (x) => { v = x; Object.assign(v.results, window.__snap.results); } });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let sumCalls = 0, sumOk = true;
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://script.google.com/**', route => {
    sumCalls++;
    if (!sumOk) return route.abort();
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(SUMMARY) });
  });
  await page.route('https://secure-hotels.net/**', r => r.abort());   // links are checked, never followed
  const url = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
  const noHScroll = async (where) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal scroll: ' + where);
  const hrefs = () => page.$$eval('a.bk-open', as => as.map(a => a.getAttribute('href')));
  const rows = () => page.locator('.bk-fam').count();
  const setCount = async (n) => { await page.fill('#bk-count', String(n)); await page.dispatchEvent('#bk-count', 'change'); };
  const setNum = async (i, k, v) => { const s = `input[data-i="${i}"][data-k="${k}"]`; await page.fill(s, String(v)); await page.dispatchEvent(s, 'change'); };

  await page.goto(url);
  await page.click('#tab-place');
  assert.ok(await page.isVisible('#booking'), 'the panel renders and unhides');
  const head = await page.innerText('#booking');
  assert.ok(head.includes('06/10 עד 13/10'), 'dates day-first, never a dash range: ' + head.slice(0, 120));
  assert.ok(!/\d\/\d+\s*[-–]\s*\d/.test(head), 'no dash range');
  assert.ok(head.includes('נבדק ב-13/10 18:14'), 'snapshot time');
  assert.ok(head.includes('לינת שטח באוהלים פרטיים') && head.includes('מאהל גדול קבוע'), 'snapshot lodging types');
  assert.ok(head.includes('רט״ג') && head.includes('המשפחה הראשונה'), 'the pay-on-RTG note');

  // one family: one order, default 2 adults, link exact; the snapshot's composition gives its real total
  assert.strictEqual(await rows(), 1);
  assert.deepStrictEqual(await hrefs(), [BASE + '&rooms=1' + q(1, [2, 0, 0])]);
  assert.ok((await page.innerText('.bk-fprice')).includes('1,064'), 'snapshot total for the matching composition');
  assert.ok((await page.innerText('.bk-fprice')).includes('לפי הבדיקה'));

  // a composition not in the snapshot: an estimate from rates = nights x (adults x adult + children x child)
  const rates = await page.evaluate(() => window.CAMPSITES.campsites.find(c => c.id === 23).rates);
  await setNum(0, 'children', 2);
  const est = 7 * (2 * rates.adult + 2 * rates.child);
  const t = await page.innerText('.bk-fprice');
  assert.ok(t.includes('הערכה') && t.includes(est.toLocaleString('he-IL')), 'estimate ' + est + ' in: ' + t);
  assert.deepStrictEqual(await hrefs(), [BASE + '&rooms=1' + q(1, [2, 2, 0])]);

  // rows follow the count; 5 families = 2 orders (4 + 1)
  await setCount(4);
  assert.strictEqual(await rows(), 4); assert.strictEqual((await hrefs()).length, 1);
  await setCount(5);
  assert.strictEqual(await rows(), 5);
  await setNum(4, 'infants', 1); await setNum(4, 'adults', 3);
  const h = await hrefs();
  assert.strictEqual(h.length, 2, '5 families make 2 orders');
  assert.strictEqual(h[0], BASE + '&rooms=4' + q(1, [2, 2, 0]) + q(2, [2, 0, 0]) + q(3, [2, 0, 0]) + q(4, [2, 0, 0]));
  assert.strictEqual(h[1], BASE + '&rooms=1' + q(1, [3, 0, 1]));
  assert.strictEqual(await page.locator('.bk-order').count(), 2);
  assert.ok((await page.innerText('.bk-order >> nth=0')).includes('הזמנה 1 מתוך 2'));
  assert.strictEqual(await page.locator('a.bk-open').first().getAttribute('target'), '_blank');
  await noHScroll('5 families at 360px');

  // limits clamp (engine: adults <= 35, children <= 20, infants <= 4; at least one adult)
  await setNum(0, 'adults', 99); await setNum(0, 'children', 99); await setNum(0, 'infants', 9);
  assert.strictEqual((await hrefs())[0].includes(q(1, [35, 20, 4])), true, 'clamped to the engine limits');
  await setNum(0, 'adults', 0);
  assert.ok((await hrefs())[0].includes('&ad1=1&'), 'at least one adult');
  await setCount(99);
  assert.strictEqual(await rows(), 20, 'family count is capped');
  await setCount(0);
  assert.strictEqual(await rows(), 1, 'at least one family');

  // the form is remembered
  await setCount(2); await setNum(1, 'children', 3);
  await page.reload(); await page.click('#tab-place');
  assert.strictEqual(await rows(), 2, 'family count remembered');
  assert.strictEqual(await page.inputValue('input[data-i="1"][data-k="children"]'), '3', 'composition remembered');

  // prefill from the public summary: count + names; the composition is not public, so it stays the default
  await page.click('#bk-prefill');
  await page.waitForFunction(() => document.querySelectorAll('.bk-fam').length === 3);
  assert.deepStrictEqual(await page.$$eval('input[data-k="name"]', is => is.map(i => i.value)), ['כהן', 'לוי', 'מזרחי']);
  assert.deepStrictEqual(await page.$$eval('input[data-k="adults"]', is => is.map(i => i.value)), ['2', '2', '2']);
  assert.deepStrictEqual(await page.$$eval('input[data-k="children"]', is => is.map(i => i.value)), ['0', '0', '0']);
  const m = await page.innerText('#bk-msg');
  assert.ok(m.includes('מולאו 3 משפחות') && m.includes('לא כוללת את הרכב') && m.includes('11'), 'prefill says what it could not fill: ' + m);
  assert.ok(!(await page.innerText('#booking')).includes('PIN'), 'no codes shown');
  assert.deepStrictEqual(await hrefs(), [BASE + '&rooms=3' + q(1, [2, 0, 0]) + q(2, [2, 0, 0]) + q(3, [2, 0, 0])]);
  await noHScroll('after prefill');

  // offline: prefill falls back to the cached summary, or says there is nothing
  sumOk = false;
  await page.evaluate((s) => localStorage.setItem('achziv-summary-cache', JSON.stringify(s)), { ok: true, families: 2, names: ['א', 'ב'], nights: {} });
  await page.click('#bk-prefill');
  await page.waitForFunction(() => document.querySelectorAll('.bk-fam').length === 2);
  await page.evaluate(() => localStorage.removeItem('achziv-summary-cache'));
  await page.click('#bk-prefill');
  await page.waitForFunction(() => /עוד אין משפחות/.test(document.getElementById('bk-msg').textContent));
  assert.strictEqual(await rows(), 2, 'nothing to fill leaves the form alone');

  await page.screenshot({ path: process.env.SHOT || undefined, fullPage: false }).catch(() => {});
  assert.deepStrictEqual(errors, [], 'page errors');
  await browser.close();
  console.log('booking e2e: ok (' + sumCalls + ' summary calls)');
})().catch(e => { console.error(e); process.exit(1); });
