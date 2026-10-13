// Run: node tests/rtg.test.js — rtg.js: the RTG deep link and the split into orders of at most 4 families.
const assert = require('assert');
global.window = {};
require('../rtg.js');
const R = window.RTG;

// the same URL the crawler opened for its reference composition (data/availability.json)
assert.strictEqual(R.bookingUrl(13, '2026-11-12', '2026-11-14', [{ adults: 2, children: 2, infants: 0 }]),
  'https://secure-hotels.net/INPA/BE_Results.aspx?lang=heb&hotel=13&in=2026-11-12&out=2026-11-14&rooms=1&ad1=2&ch1=2&inf1=0');
assert.strictEqual(R.bookingUrl(23, '2026-10-06', '2026-10-08', [{ adults: 2, children: 3 }, { adults: 1, infants: 1 }]),
  'https://secure-hotels.net/INPA/BE_Results.aspx?lang=heb&hotel=23&in=2026-10-06&out=2026-10-08&rooms=2&ad1=2&ch1=3&inf1=0&ad2=1&ch2=0&inf2=1');
assert.throws(() => R.bookingUrl(13, 'a', 'b', []));
assert.throws(() => R.bookingUrl(13, 'a', 'b', [{}, {}, {}, {}, {}]));

assert.deepStrictEqual(R.splitOrders([1, 2, 3, 4, 5]), [[1, 2, 3, 4], [5]]);
assert.deepStrictEqual(R.splitOrders([1, 2, 3, 4]), [[1, 2, 3, 4]]);
assert.deepStrictEqual(R.splitOrders([]), []);
console.log('all rtg tests passed');
