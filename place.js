// The trip's header and the "על המקום" tab, from trip.js (window.TRIP) and the crawled campsite record
// (data/campsites.js, window.CAMPSITES). A new trip changes trip.json only; nothing here is per campsite.
// The hand-written Achziv texts this replaced are in git history (before campsites-plan §5.3 box 2).
(function () {
  'use strict';
  var T = window.TRIP, all = (window.CAMPSITES && window.CAMPSITES.campsites) || [];
  if (!T) return;
  var site = all.filter(function (c) { return c.id === T.campsiteId; })[0];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dm(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
  // RTL: a range is written with "עד", never a dash (CLAUDE.md)
  var range = dm(T.from) + ' עד ' + dm(T.to) + '/' + T.to.slice(0, 4);
  var place = site ? site.shortName : '';

  // ---- header, title, navigation ----
  document.title = T.title;
  var meta = document.querySelector('meta[name=description]');
  if (meta) meta.setAttribute('content', 'מחשבון עלות לינה לקבוצה ב' + (site ? site.name : T.title) + ', ' + range);
  var h1 = document.querySelector('header.top h1'), sub = document.querySelector('header.top .sub');
  if (h1) h1.textContent = T.title;
  if (sub) sub.innerHTML = 'קמפינג קבוצתי · ' + esc(site ? site.name : '') + ' · ' + esc(range);
  var dest = site && (site.waze || site.name);
  var waze = document.getElementById('nav-waze'), gmaps = document.getElementById('nav-gmaps');
  if (dest && waze) waze.href = 'https://waze.com/ul?q=' + encodeURIComponent(dest) + '&navigate=yes';
  if (dest && gmaps) gmaps.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest);

  // ---- the place tab ----
  var box = document.getElementById('place-info');
  if (!box) return;
  if (!site) {
    box.innerHTML = '<div class="card"><p>אין עדיין מידע על החניון הזה.</p></div>';
    return;
  }
  function card(title, body) { return body ? '<div class="card"><h2>' + esc(title) + '</h2>' + body + '</div>' : ''; }
  function list(items, cls) {
    items = (items || []).filter(Boolean);
    return items.length ? '<ul class="' + cls + '">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
  }
  function fact(dt, dd) { return dd ? '<dt>' + esc(dt) + '</dt><dd>' + esc(dd) + '</dd>' : ''; }
  var h = site.hours || {};
  // "… – לחץ כאן" is a link on parks.org.il; the text alone points nowhere here
  var other = (h.other || []).map(function (s) { return s.replace(/\s*[–-]?\s*לחץ כאן\s*$/, ''); });
  var facts = fact('כניסה לחניון (קיץ)', h.summer) + fact('כניסה לחניון (חורף)', h.winter) + fact('כניסה', h.entry) +
    fact('פינוי ביום העזיבה', h.checkout) + fact('מרכז השירות', site.serviceHours) +
    (T.maxConsecutiveNights ? fact('מקסימום', T.maxConsecutiveNights + ' לילות ברצף.') : '');
  var rentals = (site.rentals || []).map(function (r) {
    return '<li>' + esc(r.label) + (r.price != null ? ' — ' + esc(r.price) + ' ₪' : '') +
      (r.note ? '<br><small>' + esc(r.note) + '</small>' : '') + '</li>';
  }).join('');
  var lodging = (site.lodging || []).map(function (r) {
    return '<li>' + esc(r.label) + (r.price != null ? ' — ' + esc(r.price) + ' ₪' : '') + '</li>';
  }).join('');
  var c = site.contact || {}, contact = [];
  if (c.phone) contact.push('טלפון: <a href="tel:' + esc(c.phone.replace(/[^\d*+]/g, '')) + '">' + esc(c.phone) + '</a>');
  if (c.whatsapp) contact.push('<a href="' + esc(c.whatsapp) + '" target="_blank" rel="noopener">וואטסאפ</a>');
  if (c.email) contact.push('דוא"ל: <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>');
  // the crawler runs every 6h and commits a heartbeat at least every 36h, so 3 days old means it stopped
  var at = window.CAMPSITES.checkedAt, stale = at && Date.now() - new Date(at).getTime() > 3 * 864e5;
  var checked = at ? dm(at.slice(0, 10)) + ' ' + at.slice(11, 16) : '';

  box.innerHTML =
    card('שעות', facts ? '<dl class="facts">' + facts + '</dl>' + list(other, 'rules') : '') +
    card('מה יש בחניון', list(site.facilities, 'facilities')) +
    card('השכרת ציוד', rentals ? '<ul class="facilities">' + rentals + '</ul>' : '') +
    (lodging ? '<div class="card"><details><summary><strong>לינה בחניון במקום אוהל משלכם</strong> (' +
      site.lodging.length + ' אפשרויות)</summary><ul class="facilities">' + lodging + '</ul></details></div>' : '') +
    card('איך מגיעים ויצירת קשר',
      (site.directions ? '<p>' + esc(site.directions) + '</p>' : '') +
      (site.waze ? '<p>בוויז: <strong>' + esc(site.waze) + '</strong></p>' : '') +
      (contact.length ? '<p>' + contact.join(' · ') + '</p>' : '')) +
    '<p class="hint" id="place-checked">המידע מאתר רשות הטבע והגנים' + (checked ? ', עודכן ב-' + esc(checked) : '') +
      (stale ? ' <strong class="stale">(לא עודכן יותר מ-3 ימים: ייתכן שהמידע השתנה)</strong>' : '') +
      '. <a href="' + esc(site.url) + '" target="_blank" rel="noopener">לעמוד החניון באתר רט״ג</a></p>';
  window.PLACE = { site: site, name: place, range: range };
})();
