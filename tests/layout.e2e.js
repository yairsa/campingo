// Run: node tests/layout.e2e.js — the page frame in headless Chrome at 360px (docs/campingo-plan.md §3): the home page
// (the next trip, the hive), every hexagon opening its view, "→ ראשי" and the phone's back returning home, old links
// (#gear, #prices) opening their view over a home entry, the bar on top fixed, the price list as a section of the
// calculator, and the "no planned camping" state. The Google URL is aborted, so nothing reaches the live sheet.
const openView = require('./open-view');
const assert = require('assert'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'C:/YairSahar_Business/ParentingUpClose_Website/node_modules/playwright-core');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const errors = [];
  async function newPage(today) {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    if (today) await page.addInitScript((t) => { window.CAMPINGO_TODAY = t; }, today);
    await require('./pin-trip')(page);                                 // Achziv, 06/10 to 13/10/2026 (tests/pin-trip.js)
    await page.addInitScript(() => { window.ACHZIV_NOTOUR = 1; });   // no guided tours or share modal here: tour.e2e.js covers them
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://**', r => r.abort());
    return page;
  }
  const url = 'file:///' + path.resolve(__dirname, '../index.html').replace(/\\/g, '/');
  let page = await newPage();
  const noHScroll = async (where) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'horizontal scroll: ' + where);
  const top = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, sel);
  const atHome = async () => { await page.waitForSelector('#home', { state: 'visible' }); assert.ok(await page.isHidden('.tabs')); };

  // ---- the home page: the brand, the next trip, the hive ----
  await page.goto(url);
  await atHome();
  assert.strictEqual(await page.textContent('#home-title'), 'CampinGo');
  assert.strictEqual(await page.title(), 'CampinGo · פארק אכזיב - אוקטובר 2026');
  assert.strictEqual(await page.textContent('#trip-kicker'), 'הקמפינג הבא');
  assert.strictEqual(await page.textContent('#trip-name'), 'גן לאומי אכזיב');
  assert.strictEqual(await page.textContent('#trip-dates'), '06/10 עד 13/10/2026 · 7 לילות');
  assert.strictEqual(await page.textContent('#trip-when'), 'בעוד 5 ימים');
  assert.ok(decodeURIComponent(await page.getAttribute('#nav-waze', 'href')).includes('q=חניון לילה גן לאומי אכזיב'));
  assert.deepStrictEqual(await page.locator('#hive-trip .hex').allInnerTexts(), ['מחשבון', 'מחירון', 'רשימת ציוד', 'על המקום', 'פעילויות']);
  assert.deepStrictEqual(await page.locator('#hive-general .hex').allInnerTexts(), ['חניונים', 'טיפים לקמפינג']);
  for (const id of ['calc', 'place', 'gear', 'acts', 'sites', 'tips']) assert.ok(await page.isHidden('#panel-' + id), id + ' shows on the home page');
  // the hive: 3 hexagons in the first row, the next row in its gaps, all on screen
  const hex = await page.evaluate(() => [...document.querySelectorAll('#hive-trip .hex')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right)]; }));
  assert.ok(hex[0][1] === hex[1][1] && hex[1][1] === hex[2][1] && hex[3][1] > hex[0][1] && hex[3][1] === hex[4][1], JSON.stringify(hex));
  assert.ok(hex[3][1] - hex[0][1] < (await page.evaluate(() => document.querySelector('.hex').offsetHeight)), 'the rows do not interlock');
  assert.ok(hex.every(h => h[0] >= 0 && h[2] <= 360), 'a hexagon off screen: ' + JSON.stringify(hex));
  await noHScroll('home');

  // ---- every hexagon opens its view; → ראשי and the phone's back return home ----
  const VIEWS = { calc: ['panel-calc', 'מחשבון לינה'], prices: ['calc-prices', 'מחירון'], gear: ['panel-gear', 'רשימת ציוד'],
    place: ['panel-place', 'על המקום'], acts: ['panel-acts', 'פעילויות'], sites: ['panel-sites', 'חניונים'], tips: ['panel-tips', 'טיפים לקמפינג'] };
  for (const [v, [el, title]] of Object.entries(VIEWS)) {
    await page.click('#tab-' + v);
    assert.ok(await page.isVisible('#' + el) && await page.isHidden('#home'), v + ' did not open');
    assert.strictEqual(await page.textContent('#view-title'), title);
    assert.ok(page.url().endsWith('#' + v), page.url());
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'view-title', 'focus after opening ' + v);
    await noHScroll(v);
    if (v === 'gear') await page.goBack(); else await page.click('#go-home');
    await atHome();
    assert.ok(!page.url().includes('#'), 'home keeps a hash: ' + page.url());
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'tab-' + v, 'focus back on the hexagon of ' + v);
  }
  // the calculator's note shows under the calculator only; the site-wide note on every view
  for (const v of ['place', 'gear', 'acts', 'sites', 'tips']) { await openView(page, v); assert.ok(await page.isHidden('.foot'), 'the note shows on ' + v); }
  await openView(page, 'calc');
  assert.ok((await page.locator('.foot').innerText()).includes('המחיר הקובע'));
  assert.ok(await page.isVisible('.site-note'));

  // ---- the bar on top and the calculator's bar stay on top while scrolling ----
  await page.mouse.move(180, 500);
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(200);
  assert.strictEqual(await top('.tabs'), 0, 'the bar on top scrolled away');
  const barTop = await top('#calc-main .subbar'), tabsH = await page.evaluate(() => document.querySelector('.tabs').offsetHeight);
  assert.ok(Math.abs(barTop - tabsH) <= 1, 'the מחירון bar is not right under the bar on top: ' + barTop + ' vs ' + tabsH);
  const scrolled = await page.evaluate(() => window.scrollY);

  // ---- the price list from the calculator: replaces it from the top; ✕ returns to the same place ----
  // (dispatched, not page.click: Playwright would scroll the button into view first, which a tap does not)
  await page.locator('#open-prices').dispatchEvent('click');
  assert.ok(await page.isVisible('#price-table') && await page.isHidden('#calc-main'));
  assert.ok(await page.locator('#price-table tbody tr').count() > 5);
  assert.strictEqual(await page.evaluate(() => window.scrollY), 0);
  assert.ok(await page.evaluate(() => document.activeElement.id === 'close-prices'));
  await noHScroll('prices');
  await page.mouse.wheel(0, 400); await page.waitForTimeout(200);
  assert.strictEqual(await top('#calc-prices .subbar'), tabsH, 'the ✕ bar is not fixed under the bar on top');
  await page.click('#close-prices');
  await page.waitForFunction(() => !document.getElementById('calc-main').hidden);
  assert.ok(await page.isHidden('#calc-prices'));
  await page.waitForTimeout(300);
  const back = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(back - scrolled) < 5, 'the calculator did not return to its place: ' + back + ' vs ' + scrolled);
  // the phone's back closes it too, to the calculator; once more back: home; → ראשי from the price list: home at once
  await page.click('#open-prices');
  await page.goBack();
  await page.waitForFunction(() => !document.getElementById('calc-main').hidden);
  assert.ok(await page.isHidden('#calc-prices') && await page.isVisible('#panel-calc'));
  await page.click('#open-prices');
  await page.click('#go-home');
  await atHome();

  // ---- old links open their view; back (or → ראשי) lands on the home page, not off the site ----
  for (const h of ['gear', 'prices']) {
    await page.goto('about:blank'); await page.goto(url + '#' + h);
    assert.ok(await page.isVisible(h === 'prices' ? '#price-table' : '#panel-gear') && await page.isHidden('#home'), '#' + h);
    if (h === 'gear') { await page.goBack(); await atHome(); }
    else {
      await page.click('#close-prices');                     // from a link: ✕ opens the calculator
      assert.ok(await page.isVisible('#calc-main'));
      await page.click('#go-home'); await atHome();
    }
  }
  await page.goto(url + '#nothing'); await atHome();          // an unknown hash: the home page

  // the place view comes from the trip's crawled campsite (place.js; pinned: Achziv, campsite 23)
  await openView(page, 'place');
  assert.ok((await page.locator('#place-info .card h2').allInnerTexts()).includes('מה יש בחניון'));
  assert.ok((await page.textContent('#place-checked')).includes('עודכן ב-'));
  await noHScroll('place');

  // ---- during the trip, the day before, and after it with no trip planned ----
  const states = { '2026-10-08': 'אנחנו שם עכשיו!', '2026-10-05': 'מחר!' };
  for (const [day, when] of Object.entries(states)) {
    page = await newPage(day); await page.goto(url);
    assert.strictEqual(await page.textContent('#trip-when'), when, day);
    await page.close();
  }
  page = await newPage('2026-10-14'); await page.goto(url); await atHome();
  assert.strictEqual(await page.textContent('#trip-kicker'), 'אין כרגע קמפינג מתוכנן');
  assert.ok(await page.isHidden('#hive-trip') && await page.isHidden('#trip-name') && await page.isHidden('#trip-nav'));
  assert.ok(await page.isVisible('#hive-general'));
  assert.strictEqual(await page.title(), 'CampinGo');
  await openView(page, 'sites');                                 // the general views still open
  assert.ok(await page.isVisible('#panel-sites'));
  await noHScroll('no trip');

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('all layout e2e tests passed');
})().catch(e => { console.error(e); process.exit(1); });
