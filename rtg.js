// RTG (parks.org.il) booking engine: the deep link to its real order page, and its limits.
// Shared by the campsites explorer and the booking helper; the crawler builds the same URL (crawler/crawl.py).
// The page opens pre-filled with each composition, live availability per lodging type and the full prices.
// Nothing here books: the family finishes the order (card, details) on RTG's own page.
(function () {
  'use strict';
  var RESULTS = 'https://secure-hotels.net/INPA/BE_Results.aspx';
  // from the engine's #engineSettings (measured 13/10/2026): one order holds at most 4 compositions, same nights
  var LIMITS = { orderMax: 4, adults: 35, children: 20, infants: 4 };

  // comps: [{adults, children, infants}], at most LIMITS.orderMax of them
  function bookingUrl(bookingId, from, to, comps) {
    if (!comps.length || comps.length > LIMITS.orderMax) throw new Error('an RTG order holds 1 to ' + LIMITS.orderMax + ' compositions');
    var q = ['lang=heb', 'hotel=' + bookingId, 'in=' + from, 'out=' + to, 'rooms=' + comps.length];
    comps.forEach(function (c, i) {
      var n = i + 1;
      q.push('ad' + n + '=' + (c.adults || 0), 'ch' + n + '=' + (c.children || 0), 'inf' + n + '=' + (c.infants || 0));
    });
    return RESULTS + '?' + q.join('&');
  }

  // families: any array -> arrays of at most LIMITS.orderMax, in order (5 families = 4 + 1)
  function splitOrders(families) {
    var out = [];
    for (var i = 0; i < families.length; i += LIMITS.orderMax) out.push(families.slice(i, i + LIMITS.orderMax));
    return out;
  }

  window.RTG = { bookingUrl: bookingUrl, splitOrders: splitOrders, LIMITS: LIMITS };
})();
