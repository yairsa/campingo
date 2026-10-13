/* The RTG booking helper (docs/campsites-plan.md §5.5): "הזמנה ברט״ג" panel at the top of "על המקום".
   Families (one RTG composition each) -> orders of at most 4 -> one deep link per order (RTG.bookingUrl).
   Nothing is booked here: the order is completed and paid on RTG's own site.
   Public data only: the registered families' names and people per night (the public summary). */
(function () {
  'use strict';
  var box = document.getElementById('booking');
  if (!box || !window.RTG || !window.TRIP) return;
  var T = window.TRIP, L = window.RTG.LIMITS;
  var camp = ((window.CAMPSITES && window.CAMPSITES.campsites) || []).filter(function (c) { return c.id === T.campsiteId; })[0];
  if (!camp || !camp.bookingId) return;
  var MAX_FAMILIES = 20, FORM_KEY = 'booking-form-' + T.id, SUM_KEY = 'achziv-summary-cache';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dm(iso) { var p = iso.split('-'); return p[2] + '/' + p[1]; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function when(iso) { var d = new Date(iso); return isNaN(d) ? '' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function clamp(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function money(n) { return Math.round(n).toLocaleString('he-IL') + ' ₪'; }
  var nights = Math.round((Date.parse(T.to) - Date.parse(T.from)) / 864e5);

  // ---- state: [{name, adults, children, infants}] ----
  function fam(f) {
    f = f || {};
    return { name: String(f.name || '').slice(0, 40), adults: clamp(f.adults == null ? 2 : f.adults, 1, L.adults),
             children: clamp(f.children, 0, L.children), infants: clamp(f.infants, 0, L.infants) };
  }
  var fams = [fam()];
  try {
    var saved = JSON.parse(localStorage.getItem(FORM_KEY));
    if (Array.isArray(saved) && saved.length) fams = saved.slice(0, MAX_FAMILIES).map(fam);
  } catch (e) { /* no saved form */ }
  function save() { try { localStorage.setItem(FORM_KEY, JSON.stringify(fams)); } catch (e) { /* ignore */ } }

  // ---- the crawler's snapshot for this campsite and these dates ----
  var snap = window.AVAILABILITY && window.AVAILABILITY.results &&
    window.AVAILABILITY.results[[T.campsiteId, T.from, T.to].join('|')];
  function snapFor(f) {
    if (!snap) return null;
    for (var i = 0; i < snap.comps.length; i++) {
      var c = snap.comps[i].comp;
      if (c.adults === f.adults && c.children === f.children && c.infants === f.infants) return snap.comps[i];
    }
    return null;
  }
  function regularTotal(sc) {   // the cheapest lodging type's regular price (first rate = regular)
    var best = null;
    sc.lodging.forEach(function (l) { if (l.rates && l.rates.length && (best == null || l.rates[0].total < best)) best = l.rates[0].total; });
    return best;
  }
  function estimate(f) {        // nights x (adults x adult + children x child); toddlers are free
    var r = camp.rates || {};
    if (!r.adult || !r.child || nights < 1) return null;
    return nights * (f.adults * r.adult + f.children * r.child);
  }

  function famPrice(f) {
    var sc = snapFor(f), t = sc && regularTotal(sc);
    if (t != null) return '<span class="bk-price">' + money(t) + '</span> <span class="hint">מחיר רגיל לפי הבדיקה</span>';
    var e = estimate(f);
    return e == null ? '' : '<span class="bk-price">כ-' + money(e) + '</span> <span class="hint">הערכה (מחיר רגיל)</span>';
  }

  function numField(i, key, label, hint, max, min) {
    return '<label class="bk-num"><span class="lbl">' + label + '</span><span class="meta">' + hint + '</span>' +
      '<input type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + fams[i][key] + '" data-i="' + i + '" data-k="' + key + '"></label>';
  }

  function availabilityHtml() {
    if (!snap) return '<p class="hint">עוד אין בדיקת זמינות לתאריכים האלה. הכפתור למטה פותח את האתר של רט״ג עם הזמינות החיה.</p>';
    var first = snap.comps[0], types = first ? first.lodging : [];
    var at = '<span class="hint">נבדק ב-' + when(snap.checkedAt) + '</span>';
    if (!types.length) return '<p><strong>אין זמינות</strong> בתאריכים האלה. ' + at + '</p>';
    return '<p><strong>פנוי בתאריכים האלה:</strong> ' + at + '</p><ul class="bk-lodging">' +
      types.map(function (l) { return '<li>' + esc(l.name) + ' <span class="hint">(מ-' + money(l.fromPerNight) + ' ללילה)</span></li>'; }).join('') +
      '</ul><p class="hint">הבדיקה היא תמונת מצב. האתר של רט״ג מציג את הזמינות העדכנית.</p>';
  }

  function render() {
    var orders = window.RTG.splitOrders(fams), idx = 0;
    var html = '<h2>הזמנה ברט״ג</h2>' +
      '<p>מכינים כאן את ההזמנה, ומסיימים ושולמים באתר של רט״ג. התאריכים: <strong>' + dm(T.from) + ' עד ' + dm(T.to) + '</strong> (' +
      nights + (nights === 1 ? ' לילה' : ' לילות') + ').</p>' + availabilityHtml() +
      '<div class="bk-top"><label class="bk-count">כמה משפחות? <input type="number" inputmode="numeric" id="bk-count" min="1" max="' + MAX_FAMILIES + '" value="' + fams.length + '"></label>' +
      '<button type="button" class="btn-secondary" id="bk-prefill">מילוי מהנרשמים</button></div><p class="hint" id="bk-msg" role="status"></p>';
    orders.forEach(function (group, o) {
      html += '<section class="bk-order" aria-label="הזמנה ' + (o + 1) + '"><h3>' + (orders.length > 1 ? 'הזמנה ' + (o + 1) + ' מתוך ' + orders.length : 'ההזמנה') +
        ' <span class="hint">(' + group.length + (group.length === 1 ? ' משפחה' : ' משפחות') + ')</span></h3>';
      group.forEach(function (f) {
        var i = idx++;
        html += '<div class="bk-fam" data-fam="' + i + '"><label class="bk-name"><span class="lbl">משפחה ' + (i + 1) + '</span>' +
          '<input type="text" maxlength="40" placeholder="שם (לא חובה)" value="' + esc(f.name) + '" data-i="' + i + '" data-k="name"></label>' +
          '<div class="bk-nums">' + numField(i, 'adults', 'מבוגרים', '18 ומעלה', L.adults, 1) + numField(i, 'children', 'ילדים', 'עד 18', L.children, 0) +
          numField(i, 'infants', 'פעוטות', 'עד 5', L.infants, 0) + '</div><p class="bk-fprice">' + famPrice(f) + '</p></div>';
      });
      var url = window.RTG.bookingUrl(camp.bookingId, T.from, T.to, group.map(function (f) { return { adults: f.adults, children: f.children, infants: f.infants }; }));
      html += '<a class="btn-primary bk-open" target="_blank" rel="noopener" href="' + esc(url) + '">פתיחת ההזמנה באתר רט״ג</a>' +
        '<p class="hint">ההזמנה מסתיימת ומשולמת באתר של רט״ג. המשפחה הראשונה שמגיעה משלמת על ההזמנה כולה (או ממתינה לשאר).</p></section>';
    });
    box.innerHTML = html;
    box.hidden = false;
  }

  function msg(t) { var m = document.getElementById('bk-msg'); if (m) m.textContent = t; }

  // input handlers (delegated)
  box.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'bk-count') {
      var n = clamp(t.value, 1, MAX_FAMILIES);
      while (fams.length < n) fams.push(fam());
      fams.length = n; save(); render(); return;
    }
    if (t.dataset && t.dataset.k) {
      var f = fams[+t.dataset.i], k = t.dataset.k;
      if (k === 'name') f.name = t.value.slice(0, 40);
      else f[k] = clamp(t.value, k === 'adults' ? 1 : 0, k === 'adults' ? L.adults : k === 'children' ? L.children : L.infants);
      save(); render();
    }
  });

  // "מילוי מהנרשמים": only the PUBLIC summary (names, families, people per night). The composition of each
  // family is not public, so the count and the names are filled and the composition is left to the user.
  function summary() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(SUM_KEY)); } catch (e) { /* none */ }
    var url = T.apiUrl || (window.CAMP && window.CAMP.apiUrl);
    if (!url) return Promise.resolve(cached);
    return fetch(url).then(function (r) { return r.json(); }).then(function (s) { return s && s.ok ? s : cached; }, function () { return cached; });
  }
  box.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#bk-prefill');
    if (!btn) return;
    btn.disabled = true; msg('טוען את הנרשמים…');
    summary().then(function (s) {
      btn.disabled = false;
      var n = s && s.families ? Math.min(s.families, MAX_FAMILIES) : 0;
      if (!n) { msg('עוד אין משפחות רשומות למלא מהן.'); return; }
      var names = (s.names && s.names.length === s.families) ? s.names : [];
      fams = [];
      for (var i = 0; i < n; i++) fams.push(fam({ name: names[i] || '' }));
      var peak = 0; Object.keys(s.nights || {}).forEach(function (k) { peak = Math.max(peak, s.nights[k]); });
      save(); render();
      msg('מולאו ' + n + (n === 1 ? ' משפחה' : ' משפחות') + (names.length ? ' לפי השמות שנרשמו' : '') +
        '. הרשימה הציבורית לא כוללת את הרכב המשפחות' + (peak ? ' (עד ' + peak + ' לנים בלילה העמוס)' : '') + ': עדכנו מבוגרים, ילדים ופעוטות לכל משפחה.');
    });
  });

  render();
})();
