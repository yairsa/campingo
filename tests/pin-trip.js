// Pins a page (or a browser context) to the Achziv trip of October 2026, whatever trip.json says today.
// The e2e tests were written against Achziv's prices and dates; prices.js and trip.js are generated from the
// current trip (tools/trip.py), so the tests lock window.CAMP / window.TRIP to tests/fixtures/ before any script runs.
// (The pages load from file://, which page.route cannot intercept, hence an init script.)
const fs = require('fs'), path = require('path'), vm = require('vm');

function load(file) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'), ctx);
  return ctx.window;
}
const FIXTURE = { CAMP: load('prices-achziv.js').CAMP, TRIP: load('trip-achziv.js').TRIP };

// usage: await pinTrip(page)  or  await pinTrip(context)
module.exports = async function pinTrip(target) {
  await target.addInitScript((fx) => {
    for (const k of Object.keys(fx)) Object.defineProperty(window, k, { get: () => fx[k], set: () => {}, configurable: false });
  }, FIXTURE);
};
module.exports.FIXTURE = FIXTURE;

// The same pin for backend/Code.gs running in a vm context: Code.gs carries prices.js + calc.js (backend/build.py),
// so the vm re-runs the Achziv prices and calc.js over the copy it was built with.
module.exports.pinBackend = function pinBackend(ctx) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'fixtures', 'prices-achziv.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'calc.js'), 'utf8'), ctx);
};
