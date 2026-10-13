// Run: node tests/campsites.e2e.js — the חניונים explorer in headless Chrome at 360px (docs/campsites-plan.md §5.4).
// Pinned to the Achziv trip (tests/pin-trip.js); every https URL is aborted, so nothing leaves the machine.
// Needs playwright-core (PLAYWRIGHT_CORE=<path>, default: the website repo's copy) and installed Chrome (CHROME=<path>).
const assert = require('assert'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/YairSahar_Business/ParentingUpClose_Website/node_modules/playwright-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  await require('./pin-trip')(page);
  await page.addInitScript(() => { window.ACHZIV_NOTOUR = 1; });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://**', r => r.abort());
  const url = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
  const noHScroll = async (where) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal scroll: ' + where);
  const card = (id) => page.locator('#sites-list .site[data-id="' + id + '"]');
  const q = (s) => new URL(s).searchParams;

  await page.goto(url);
  await page.click('#tab-sites');
  assert.ok(await page.isVisible('#panel-sites') && await page.isHidden('#panel-calc'));

  // 18 cards in three regions; the trip's campsite (Achziv, 23) leads its region and is marked
  assert.strictEqual(await page.locator('#sites-list .site').count(), 18);
  assert.deepStrictEqual(await page.locator('#sites-list .region h3').evaluateAll(h => h.map(x => x.firstChild.textContent.trim())), ['צפון', 'מרכז', 'דרום']);
  assert.strictEqual(await page.locator('#sites-list .region').first().locator('.site').first().getAttribute('data-id'), '23');
  assert.ok((await card(23).innerText()).includes('החניון של הטיול'));
  assert.ok(await page.isVisible('#sites-updated') && /^עודכן ב-\d\d\/\d\d \d\d:\d\d/.test(await page.innerText('#sites-updated')));
  const stale = await page.evaluate(() => (Date.now() - Date.parse(window.CAMPSITES.checkedAt)) / 86400000 > 3);
  assert.strictEqual(await page.locator('#sites-updated.stale').count(), stale ? 1 : 0, 'the stale flag');
  await noHScroll('sites');

  // the card: rates, the family's estimate for the calculator's default (2 adults, 4 nights), the links
  const txt = await card(23).innerText();
  assert.ok(txt.includes('76 ₪') && txt.includes('58 ₪'), txt);
  assert.strictEqual((await card(23).locator('.site-est').innerText()).replace(/\D/g, ''), '608');   // 4 x 2 x 76
  const waze = await card(23).locator('a:has-text("Waze")').getAttribute('href');
  assert.ok(waze.startsWith('https://waze.com/ul?q=') && waze.endsWith('&navigate=yes') && decodeURIComponent(waze).includes('אכזיב'), waze);
  assert.ok((await card(23).locator('a:has-text("מידע באתר")').getAttribute('href')).startsWith('https://www.parks.org.il/'));
  assert.strictEqual(await card(23).locator('.site-avail').getAttribute('target'), '_blank');

  // search narrows (Hebrew-tolerant: a prefix letter and a final letter do not matter), and empties politely
  await page.fill('#sites-q', 'אכזיב');
  assert.ok(await page.locator('#sites-list .site').count() < 18 && await card(23).count() === 1);
  await page.fill('#sites-q', 'בארות');
  assert.strictEqual(await page.locator('#sites-list .site').count(), 1);
  assert.strictEqual(await page.locator('#sites-list .site').first().getAttribute('data-id'), '13');
  await page.fill('#sites-q', 'zzzqq');
  assert.strictEqual(await page.locator('#sites-list .site').count(), 0);
  assert.ok((await page.innerText('#sites-list')).includes('לא נמצא'));
  await page.fill('#sites-q', '');
  assert.strictEqual(await page.locator('#sites-list .site').count(), 18);

  // a composition change in the calculator reprices the cards: 2 adults + 3 children + 1 toddler
  await page.click('#tab-calc');
  const inputs = page.locator('#base-main input');
  await inputs.nth(1).fill('3'); await inputs.nth(2).fill('1');
  await page.click('#tab-sites');
  assert.strictEqual((await card(23).locator('.site-est').innerText()).replace(/\D/g, ''), '1304', 'the estimate did not follow the composition');   // 4 x (2x76 + 3x58)
  assert.ok((await page.innerText('#sites-family')).includes('2 מבוגרים, 3 ילדים, 1 פעוטות'), await page.innerText('#sites-family'));

  // the availability deep link carries the same composition and dates
  const href = await card(23).locator('.site-avail').getAttribute('href');
  assert.ok(href.startsWith('https://secure-hotels.net/INPA/BE_Results.aspx?'), href);
  const p = q(href);
  assert.deepStrictEqual([p.get('hotel'), p.get('in'), p.get('out'), p.get('ad1'), p.get('ch1'), p.get('inf1'), p.get('rooms')],
    ['23', '2026-10-06', '2026-10-10', '2', '3', '1', '1']);
  assert.strictEqual(q(await card(13).locator('.site-avail').getAttribute('href')).get('hotel'), '13');

  // changing the dates in the calculator moves the link too
  await page.click('#tab-calc');
  await page.locator('#periods select').nth(1).selectOption('2026-10-08');
  await page.click('#tab-sites');
  const p2 = q(await card(23).locator('.site-avail').getAttribute('href'));
  assert.deepStrictEqual([p2.get('in'), p2.get('out')], ['2026-10-06', '2026-10-08']);

  await noHScroll('sites after changes');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('all campsites e2e tests passed');
})().catch(e => { console.error(e); process.exit(1); });
