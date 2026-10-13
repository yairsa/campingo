// The campsites explorer (docs/campsites-plan.md §5.4): every RTG campsite from data/campsites.js, by region,
// with the family's estimated price for the calculator's composition and dates, and a deep link to RTG's own
// availability page. Rendered at once from the data (no fetch); reprices on the calculator's 'compositionchange'.
(function () {
  'use strict';
  var D = window.CAMPSITES, panel = document.getElementById('panel-sites');
  if (!D || !panel) return;
  var REGIONS = ['צפון', 'מרכז', 'דרום'];
  var STALE_DAYS = 3;
  // the key facilities shown on a card (first five that the campsite has), by what the listing says
  var KEY = [[/מקלחות/, 'מקלחות'], [/שירותים/, 'שירותים'], [/מטבח/, 'מטבח שדה'], [/טעינה/, 'טעינת טלפונים'],
    [/מקרר/, 'מקררים'], [/סככ/, 'סככות צל'], [/מדורה|גחלים/, 'מדורה'], [/מצלה|מנגל/, 'מנגל'], [/שתייה/, 'מי שתייה']];
  var CHILD_CATS = ['child', 'matmonChild', 'reserveChild'];
  var nf = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return nf.format(n) + ' ₪'; }
  function dm(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
  function nights(a, b) { var t = function (i) { var p = i.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }; return Math.round((t(b) - t(a)) / 86400000); }

  // "2026-10-13T18:14:15+03:00" -> "13/10 18:14" (read from the text: the time is Israel's, whatever the viewer's zone)
  function stamp(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d:\d\d)/.exec(iso || ''); return m ? m[3] + '/' + m[2] + ' ' + m[4] : ''; }

  // ---- the family: from the calculator (CampState), counted for RTG's three bands ----
  function family() {
    var st = window.CampState && window.CampState.get(), C = window.CAMP, T = window.TRIP || {};
    var out = { adults: 0, children: 0, infants: 0, nights: 0, from: T.from || C.defaultFrom, to: T.to || C.defaultTo, periods: [] };
    if (!st) { out.nights = Math.max(0, nights(out.from, out.to)); return out; }
    var first = null, last = null, best = -1;
    st.periods.forEach(function (p) {
      var n = nights(p.from, p.to);
      if (n <= 0) return;
      var counts = p.custom ? p.counts : st.base, a = 0, c = 0, i = counts.toddler || 0;
      C.categories.forEach(function (cat) {
        if (cat.id === 'toddler') return;
        if (CHILD_CATS.indexOf(cat.id) >= 0) c += counts[cat.id] || 0; else a += counts[cat.id] || 0;
      });
      out.nights += n; out.periods.push({ a: a, c: c, n: n });
      if (!first || p.from < first) first = p.from;
      if (!last || p.to > last) last = p.to;
      if (a + c + i > best) { best = a + c + i; out.adults = a; out.children = c; out.infants = i; }
    });
    if (first) { out.from = first; out.to = last; }
    return out;
  }
  // estimate: per period, nights x (adults x adult rate + children x child rate), ordinary rates, no discounts
  function estimate(site, fam) {
    if (!site.rates || site.rates.adult == null || !fam.periods.length) return null;
    return fam.periods.reduce(function (s, p) { return s + p.n * (p.a * site.rates.adult + p.c * (site.rates.child || 0)); }, 0);
  }

  function keyFacilities(site) {
    var text = site.facilities.join(' | '), out = [];
    KEY.forEach(function (k) { if (out.length < 5 && k[0].test(text)) out.push(k[1]); });
    return out;
  }

  function card(site, fam, tripId) {
    var est = estimate(site, fam), r = site.rates || {}, ages = site.ages || {};
    var comp = { adults: Math.min(fam.adults || 1, 35), children: Math.min(fam.children, 20), infants: Math.min(fam.infants, 4) };
    var avail = window.RTG && fam.nights > 0 ? window.RTG.bookingUrl(site.bookingId, fam.from, fam.to, [comp]) : site.bookingUrl;
    var waze = 'https://waze.com/ul?q=' + encodeURIComponent(site.waze || site.name) + '&navigate=yes';
    var facs = keyFacilities(site);
    var h = '<article class="site' + (site.id === tripId ? ' trip' : '') + '" data-id="' + site.id + '">' +
      '<h4>' + esc(site.shortName || site.name) + (site.id === tripId ? ' <span class="site-badge">החניון של הטיול</span>' : '') + '</h4>';
    if (facs.length) h += '<p class="site-facs">' + facs.map(esc).join(' · ') + '</p>';
    if (r.adult != null) {
      h += '<p class="site-rates">מבוגר <strong>' + money(r.adult) + '</strong>' + (ages.adult ? ' <small>(' + esc(ages.adult) + ')</small>' : '') +
        ' · ילד <strong>' + money(r.child) + '</strong>' + (ages.child ? ' <small>(' + esc(ages.child) + ')</small>' : '') + ' · ללילה. מתחת לגיל 5 חינם.</p>';
    } else h += '<p class="site-rates">אין מחיר מפורסם</p>';
    if (est != null) {
      h += '<p class="site-family">למשפחה שלכם: <strong class="site-est">' + money(est) + '</strong> ל-' + fam.nights + ' לילות ' +
        '<small>הערכה לפי המחשבון, במחיר רגיל. המחיר הקובע הוא בדף ההזמנה של רשות הטבע והגנים.</small></p>';
    } else h += '<p class="site-family">מלאו הרכב ותאריכים במחשבון כדי לראות מחיר למשפחה.</p>';
    h += '<div class="site-links">' +
      '<a class="btn-secondary site-avail" href="' + esc(avail) + '" target="_blank" rel="noopener">בדיקת זמינות</a>' +
      '<a class="btn-secondary" href="' + esc(waze) + '" target="_blank" rel="noopener">Waze</a>' +
      '<a class="btn-secondary" href="' + esc(site.url) + '" target="_blank" rel="noopener">מידע באתר הפארקים</a></div></article>';
    return h;
  }

  var q = document.getElementById('sites-q'), list = document.getElementById('sites-list'), summary = document.getElementById('sites-family');

  function matches(site, words) {
    if (!words.length) return true;
    var forms = searchFormsOf_([site.name, site.region, site.facilities.join(' ')].join(' '));
    return words.every(function (w) { return searchHit_(w, forms); });
  }

  function render() {
    var fam = family(), tripId = (window.TRIP && window.TRIP.campsiteId) || (window.CAMP && window.CAMP.campsiteId);
    var words = searchWords_(q.value), shown = 0, html = '';
    summary.textContent = fam.nights > 0
      ? 'המחיר למשפחה לפי המחשבון: ' + fam.adults + ' מבוגרים, ' + fam.children + ' ילדים' + (fam.infants ? ', ' + fam.infants + ' פעוטות' : '') +
        ', ' + dm(fam.from) + ' עד ' + dm(fam.to) + ' (' + fam.nights + ' לילות)'
      : 'בחרו תאריכים במחשבון כדי לראות מחיר למשפחה.';
    REGIONS.forEach(function (reg) {
      var sites = D.campsites.filter(function (s) { return s.region === reg && matches(s, words); });
      sites.sort(function (a, b) { return (b.id === tripId) - (a.id === tripId); });
      if (!sites.length) return;
      shown += sites.length;
      html += '<section class="region"><h3>' + esc(reg) + ' <small>(' + sites.length + ')</small></h3>' +
        sites.map(function (s) { return card(s, fam, tripId); }).join('') + '</section>';
    });
    list.innerHTML = html || '<p class="hint">לא נמצא חניון. נסו מילה אחרת.</p>';
    document.getElementById('sites-count').textContent = shown + ' חניונים';
  }

  // "עודכן ב-dd/MM HH:mm", flagged when older than 3 days
  var upd = document.getElementById('sites-updated'), iso = D.checkedAt;
  upd.innerHTML = 'עודכן ב-<bdi>' + stamp(iso) + '</bdi>';
  var age = (Date.now() - Date.parse(iso)) / 86400000;
  if (isNaN(age) || age > STALE_DAYS) { upd.innerHTML += ' (הנתונים ישנים, בדקו בדף ההזמנה)'; upd.classList.add('stale'); }

  q.addEventListener('input', render);
  document.addEventListener('compositionchange', render);
  render();
})();
