// Opens a view of the site the way a visitor does: from wherever the page is, "→ ראשי" back to the home page,
// then the view's hexagon (docs/campingo-plan.md §3). view: calc, prices, place, gear, acts, sites, tips.
module.exports = async function openView(page, view) {
  if (await page.isVisible('#go-home')) {
    await page.click('#go-home');
    await page.waitForSelector('#home', { state: 'visible' });
  }
  await page.click('#tab-' + view);
  await page.waitForSelector('#home', { state: 'hidden' });
};
