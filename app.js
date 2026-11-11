// Body Making check-in — screens and phone plumbing.
// The class rules live in logic.js; this file only draws screens and saves.
(function () {
  'use strict';

  const APP_VERSION = '1.9.0';
  const KEY_DB = 'bm.db', KEY_PREV = 'bm.db.prev', KEY_LANG = 'bm.lang';

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY_DB);
      if (raw) return BM.normalize(JSON.parse(raw));
    } catch (e) { console.error('load failed', e); }
    return BM.emptyDB();
  }
  let db = load();

  function save() {
    try {
      const old = localStorage.getItem(KEY_DB);
      if (old) localStorage.setItem(KEY_PREV, old);
      localStorage.setItem(KEY_DB, JSON.stringify(db));
    } catch (e) {
      alert('Save failed / 保存できませんでした: ' + e.message);
    }
  }

  let lang = 'ja';
  try { lang = localStorage.getItem(KEY_LANG) || 'ja'; } catch (e) { /* private mode */ }

  function t(key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  // ---------- tiny helpers ----------
  const $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(iso, inLang) {
    const L = inLang || lang;
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    const wd = I18N[L].days[d.getDay()];
    if (L === 'ja') return (p[1]) + '月' + p[2] + '日（' + wd + '）';
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return wd + ' ' + p[2] + ' ' + mon + (p[0] !== new Date().getFullYear() ? ' ' + p[0] : '');
  }
  function fmtFt(n) { return Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function initial(name) { return esc((name || '?').trim().charAt(0).toUpperCase()); }
  function name(cid) { const c = BM.customer(db, cid); return c ? c.name : '?'; }
  function byName(a, b) { return a.name.localeCompare(b.name); }

  // Click handlers are registered per screen region, so re-drawing one region
  // never breaks the buttons of another.
  const REG = { main: {}, card: {}, modal: {} };
  let seq = 0;
  function on(region, fn) { const id = 'a' + (++seq); REG[region][id] = fn; return 'data-r="' + region + '" data-a="' + id + '"'; }
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const fn = REG[el.dataset.r] && REG[el.dataset.r][el.dataset.a];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, undoFn) {
    const el = $('toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (undoFn ? '<button id="toastUndo">' + esc(t('undo')) + '</button>' : '');
    el.hidden = false;
    if (undoFn) $('toastUndo').onclick = function () { undoFn(); el.hidden = true; toast(t('undone')); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, undoFn ? 6000 : 2500);
  }

  // ---------- modal ----------
  function openModal(html) {
    const m = $('modal');
    m.innerHTML = '<div class="sheet">' + html + '</div>';
    m.hidden = false;
  }
  function closeModal() { const m = $('modal'); m.hidden = true; m.innerHTML = ''; REG.modal = {}; }
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });

  // ---------- navigation ----------
  let view = { name: 'today' };
  function go(name, params) { view = Object.assign({ name: name }, params || {}); render(); window.scrollTo(0, 0); }

  function renderNav() {
    const tabs = [['today', 'calendar', t('navToday')], ['customers', 'users', t('navCustomers')], ['settings', 'sliders', t('navSettings')]];
    REG.nav = {};
    $('nav').innerHTML = tabs.map(function (tb) {
      const active = view.name === tb[0] || (tb[0] === 'customers' && view.name === 'customer') || (tb[0] === 'today' && view.name === 'manual');
      return '<button class="' + (active ? 'on' : '') + '" ' + navOn(tb[0]) + '>' + icon(tb[1]) + '<span>' + esc(tb[2]) + '</span></button>';
    }).join('');
  }
  function navOn(name) { const id = 'n' + name; REG.nav[id] = function () { go(name); }; return 'data-r="nav" data-a="' + id + '"'; }

  function render() {
    REG.main = {};
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.dataset.t); });
    const fn = { today: viewToday, customers: viewCustomers, customer: viewCustomer, manual: viewManual, settings: viewSettings }[view.name] || viewToday;
    $('app').innerHTML = fn();
    renderNav();
    if (view.focus) { const f = $(view.focus); if (f) f.focus(); view.focus = null; }
  }

  // ---------- icons (simple line icons drawn in the text colour) ----------
  const ICONS = {
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M15.5 4.8a3.3 3.3 0 0 1 0 6.4M17.5 14.8c2 .7 3.4 2.4 4 5.2"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    swap: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
    qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/>',
    ticket: '<path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 0 3V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a1.5 1.5 0 0 0 0-3z"/><path d="M14.5 7.5v1.5M14.5 11.25v1.5M14.5 15v1.5"/>',
    send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    upload: '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.3 1.5A3.8 3.8 0 0 1 17.5 18M12 12v8M9 15l3-3 3 3"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
    table: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5V20"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.3"/>'
  };
  function icon(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
  // Button content: icon + label on one line, optional small second line.
  function bl(ic, label, sub) {
    return '<span class="bl">' + (ic ? icon(ic) : '') + '<span>' + esc(label) + '</span></span>' + (sub ? '<small>' + esc(sub) + '</small>' : '');
  }
  // Japanese has no spaces, so browsers break lines anywhere ("期限まであ / と5").
  // nb() keeps each "・" / "、" chunk on one line; breaks fall between chunks.
  function nb(text) {
    text = String(text);
    if (!/[・、]/.test(text)) return esc(text);           // English etc. wraps normally at spaces
    return text.split(/(?<=[・、])/).map(function (p) { return '<span class="nb">' + esc(p) + '</span>'; }).join('');
  }
  function sectionTitle(text, extra) { return '<h2 class="sec">' + esc(text) + (extra ? '<span class="sec-extra">' + extra + '</span>' : '') + '</h2>'; }
  function timeOf(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ---------- the bundle at a glance: a stamp card ----------
  // ✓ = attended · ○ = still usable · × = can no longer be used, because the
  // class-date limit runs out first (the reason "tickets left" can be lower
  // than "10 − attended").
  function stamps(b, st, compact) {
    const total = b.ticketsTotal, used = Math.min(st.attended, total), left = st.ticketsLeft;
    const lost = Math.max(0, total - used - left);
    let html = '<div class="stamps' + (compact ? ' compact' : '') + '">';
    for (let i = 0; i < total; i++) {
      const cls = i < used ? 'used' : i < used + left ? 'left' : 'lost';
      html += '<span class="stamp ' + cls + '">' + (cls === 'used' ? icon('check') : cls === 'lost' ? icon('x') : '') + '</span>';
    }
    html += '</div>';
    if (!compact) {
      html += '<p class="legend"><span class="lgd used"></span>' + esc(t('legendUsed', { n: used })) +
        '<span class="lgd left"></span>' + esc(t('legendLeft', { n: left })) +
        (lost ? '<span class="lgd lost"></span>' + esc(t('legendLost', { n: lost })) : '') + '</p>';
    }
    return html;
  }

  function statTiles(st) {
    return '<div class="stats">' +
      '<div class="stat"><span class="stat-label">' + esc(t('statTickets')) + '</span><span class="stat-num">' + st.ticketsLeft + '<small>' + esc(t('unitTimes')) + '</small></span></div>' +
      '<div class="stat"><span class="stat-label">' + esc(t('statWindow')) + '</span><span class="stat-num">' + Math.max(0, st.oppLeft) + '<small>' + esc(t('unitLessons')) + '</small></span></div>' +
      '</div>';
  }

  function lastBundle(cid) { const l = BM.customerBundles(db, cid); return l.length ? l[l.length - 1] : null; }

  // Shown when a check-in used the last usable ticket: stays until OK is tapped.
  function endedCard(msg, info, region, ok, undo) {
    return '<div class="success"><div class="big-check warn">' + icon('alert') + '</div><h3>' + esc(msg) + '</h3>' +
      '<div class="ended-box"><strong>' + esc(t('endedNow')) + '</strong>' + (info.lost ? '<span>' + esc(t('endedLost', { n: info.lost })) + '</span>' : '') +
      '<span>' + esc(t('endedTell')) + '</span></div>' +
      '<button class="btn primary" ' + on(region, ok) + '>' + esc(t('ok')) + '</button>' +
      (undo ? '<button class="btn ghost" ' + on(region, undo) + '>' + esc(t('undo')) + '</button>' : '') + '</div>';
  }

  // ---------- the action sheet (shared by scanner, hand check-in, customer page) ----------
  // Shows exactly the buttons that make sense for this person on this date.
  function actionSheet(region, cid, date, ctx) {
    const c = BM.customer(db, cid);
    const st = BM.status(db, cid, date);
    const isToday = date === BM.today();
    const head = '<div class="sheet-head"><div class="avatar lg">' + initial(c.name) + '</div><div class="grow"><h3>' + esc(c.name) + '</h3>' +
      (isToday ? '' : '<p class="status">' + esc(fmtDate(date)) + '</p>') + '</div></div>';

    if (st.state === 'checkedIn') {
      return '<div class="success"><div class="big-check info">' + icon('check') + '</div><h3>' + esc(c.name) + '</h3>' +
        '<p class="status">' + esc(t('alreadyIn')) + (st.stats ? '・' + esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) : '') + '</p>' +
        '<button class="btn primary" ' + on(region, ctx.close) + '>' + esc(t('close')) + '</button></div>';
    }

    function act(kind) {
      return on(region, function () {
        const keys = { in: 'okIn', bundle: 'okBundle' };
        if (practice) {
          const sim = kind === 'in' && st.stats && st.stats.ticketsLeft === 1
            ? { ended: true, lost: Math.max(0, st.bundle.ticketsTotal - st.stats.attended - 1) } : null;
          ctx.done(t(keys[kind], { name: c.name }) + (lang === 'ja' ? '' : ' ') + t('practiceTag'), null, cid, sim);
          return;
        }
        ensureSession(date, !!ctx.fromScanner, function () {
          let created;
          try {
            if (kind === 'in') created = [BM.checkIn(db, cid, date, { manual: ctx.manual })];
            if (kind === 'bundle') { const r = BM.sellBundleAndCheckIn(db, cid, date, { manual: ctx.manual }); created = [r.attendance, r.bundle]; }
          } catch (e) { alert(e.message); return; }
          save();
          const undo = function () {
            created.forEach(function (x) { if (x.startDate) BM.removeBundle(db, x.id); else BM.removeAttendance(db, x.id); });
            save(); render();
          };
          // Did this check-in finish the bundle (last ticket, or last class date)?
          let info = null;
          if (kind === 'in') {
            const b = created[0] && db.bundles.find(function (x) { return x.id === created[0].bundleId; });
            if (b) {
              const after = BM.bundleStats(db, b, BM.today());
              if (after.ticketsLeft === 0) info = { ended: true, lost: Math.max(0, b.ticketsTotal - after.attended) };
            }
          }
          ctx.done(t(keys[kind], { name: c.name }), undo, cid, info);
        });
      });
    }

    if (st.state === 'bundle') {
      const n = st.stats.ticketsLeft;
      return head +
        '<p class="status">' + nb(t('statusLine', { n: n, o: Math.max(0, st.stats.oppLeft) })) + '</p>' +
        (n === 1 ? '<div class="last-label">' + icon('alert') + esc(t('lastOne')) + '</div>' : '') +
        stamps(st.bundle, st.stats, true) +
        '<button class="btn big primary" ' + act('in') + '>' + bl('check', t('checkIn'), t('checkInUses', { n: n, m: n - 1 })) + '</button>' +
        '<button class="btn ghost" ' + on(region, ctx.close) + '>' + esc(t('cancel')) + '</button>';
    }

    const lb = lastBundle(cid);
    return head +
      '<p class="status">' + esc(t('noBundle')) + (lb ? '<br><span class="small">' + esc(t('lastBundleEnded', { d: fmtDate(lb.startDate) })) + '</span>' : '') + '</p>' +
      '<button class="btn big primary" ' + act('bundle') + '>' + bl('ticket', t('sellBundle'), t('sellBundleSub', { t: db.config.ticketsTotal, p: fmtFt(db.config.bundlePrice) })) + '</button>' +
      '<button class="btn ghost" ' + on(region, ctx.close) + '>' + esc(t('cancel')) + '</button>';
  }

  // A check-in needs a class on that date (class dates drive every bundle's
  // limit). The scanner is opened by "start class", so it may add today
  // silently; anywhere else, recording a class date asks first.
  function ensureSession(date, fromScanner, proceed) {
    if (BM.hasSession(db, date)) { proceed(); return; }
    const add = function () { BM.addSession(db, date); save(); proceed(); };
    if (fromScanner) { add(); return; }
    if (date === BM.today()) { confirmSlide(t('startFirstTitle'), t('startFirstText'), t('slideStart'), add, 'go'); return; }
    confirmSlide(t('addClassTitle'), t('noClassOnDate', { d: fmtDate(date) }), t('slideAddClass'), add, 'go');
  }

  function badgeFor(cid, date) {
    const st = BM.status(db, cid, date);
    if (st.state === 'checkedIn') return '<span class="badge ok">' + icon('check') + (st.stats ? esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) : esc(t('single'))) + '</span>';
    if (st.state === 'bundle') {
      const soon = Math.min(st.stats.ticketsLeft, st.stats.oppLeft) <= 2;
      return '<span class="badge' + (soon ? ' warn' : '') + '">' + esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) + '</span>';
    }
    return '<span class="badge none">' + esc(t('noBundleShort')) + '</span>';
  }

  // ---------- slide-to-confirm ----------
  // Drag the knob all the way right to trigger; it snaps back either way.
  function slider(region, label, fn, cls) {
    const id = 's' + (++seq); REG[region][id] = fn;
    return '<div class="slider' + (cls ? ' ' + cls : '') + '" data-r="' + region + '" data-s="' + id + '"><span class="slider-label">' + esc(label) + '</span>' +
      '<div class="slider-knob" aria-label="' + esc(label) + '">' + icon('next') + '</div></div>';
  }
  (function () {
    let drag = null;
    document.addEventListener('pointerdown', function (e) {
      const knob = e.target.closest('.slider-knob'); if (!knob) return;
      const track = knob.parentNode;
      drag = { knob: knob, track: track, x0: e.clientX, max: track.clientWidth - knob.offsetWidth - 8 };
      knob.style.transition = 'none'; track.classList.add('dragging');
      try { knob.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const dx = Math.max(0, Math.min(drag.max, e.clientX - drag.x0));
      drag.knob.style.transform = 'translateX(' + dx + 'px)';
      drag.track.style.setProperty('--p', (dx / drag.max).toFixed(3));
      drag.dx = dx;
    });
    function end() {
      if (!drag) return;
      const d = drag; drag = null;
      d.knob.style.transition = 'transform .25s ease'; d.knob.style.transform = 'translateX(0)';
      d.track.style.setProperty('--p', 0); d.track.classList.remove('dragging');
      if ((d.dx || 0) >= d.max * 0.92) {
        const fn = REG[d.track.dataset.r] && REG[d.track.dataset.r][d.track.dataset.s];
        if (fn) setTimeout(fn, 120);
      }
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  })();

  // A popup whose only way to go ahead is a slide (deleting, replacing, recording a class).
  function confirmSlide(title, text, label, fn, cls) {
    REG.modal = {};
    openModal('<h3>' + esc(title) + '</h3><p class="status" style="white-space:pre-line">' + esc(text) + '</p>' +
      slider('modal', label, function () { closeModal(); fn(); }, cls || 'danger') +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('cancel')) + '</button>');
  }

  // ---------- Today ----------
  function backupNotice() {
    const last = db.meta.lastBackup;
    if (!db.attendance.length) return '';
    const btn = '<button class="notice-btn" ' + on('main', saveBackup) + '>' + esc(t('backupNow')) + '</button>';
    if (!last) return '<div class="notice warn">' + icon('alert') + '<span class="grow">' + esc(t('neverBackedUp')) + '</span>' + btn + '</div>';
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    const txt = days === 0 ? t('lastBackupToday') : t('lastBackup', { d: days });
    if (days > 30) return '<div class="notice warn">' + icon('alert') + '<span class="grow">' + esc(txt) + '</span>' + btn + '</div>';
    return '<p class="quiet">' + icon('shield') + esc(txt) + '</p>';
  }

  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

  function viewToday() {
    const today = BM.today();
    const started = BM.hasSession(db, today);
    const todays = db.attendance.filter(function (a) { return a.date === today; })
      .sort(function (x, y) { return (y.ts || '') < (x.ts || '') ? -1 : 1; });

    let html = '<header class="top"><img class="logo" src="icons/logo.png" alt="Dance &amp; Smile">' +
      '<span class="chip' + (started ? ' live' : '') + '">' + esc(started ? t('chipLive') : t('chipBefore')) + '</span></header>' +
      '<h1 class="date">' + esc(fmtDate(today)) + '</h1>';
    if (!isStandalone()) html += '<div class="notice warn">' + icon('alert') + '<span class="grow">' + esc(t('storageUnsafe')) + '</span></div>';
    html += backupNotice();
    // Starting a class records a class date (every bundle's limit moves on by
    // one), so it is a slide, not a tap. Once started, Scan is a tap.
    if (started) html += '<button class="btn big primary" ' + on('main', function () { openScanner(); }) + '>' + bl('scan', t('scan')) + '</button>';
    else html += slider('main', t('slideStart'), function () { BM.addSession(db, today); save(); openScanner(); });
    html += '<button class="btn" ' + on('main', function () { go('manual', { date: today }); }) + '>' + bl('clipboard', t('byHand')) + '</button>';

    html += sectionTitle(t('checkedInToday', { n: todays.length }));
    if (!todays.length) html += '<div class="empty">' + esc(t('nobodyYet')) + '</div>';
    else html += '<div class="list">' + todays.map(function (a) { return attendanceRow(a, true); }).join('') + '</div>';

    const soon = BM.activeBundles(db).filter(function (x) { return Math.min(x.stats.ticketsLeft, x.stats.oppLeft) <= 2; });
    if (soon.length) {
      html += sectionTitle(t('endingSoon'));
      html += '<div class="list">' + soon.map(function (x) {
        return '<button class="item" ' + on('main', function () { go('customer', { id: x.customer.id }); }) + '>' +
          '<div class="avatar">' + initial(x.customer.name) + '</div><div class="grow"><div class="t1">' + esc(x.customer.name) + '</div>' +
          '<div class="t2">' + nb(t('soonLine', { n: x.stats.ticketsLeft, o: Math.max(0, x.stats.oppLeft) })) + '</div></div>' + icon('next', 'chev') + '</button>';
      }).join('') + '</div>';
    }
    return html;
  }

  function attendanceRow(a, showName) {
    const tags = [];
    if (showName) { const tm = timeOf(a.ts); if (tm) tags.push(tm); }
    if (a.type === 'Single') tags.push(t('single'));
    if (a.manual) tags.push(t('handMark'));
    const main = showName ? esc(name(a.customerId)) : esc(fmtDate(a.date));
    return '<div class="item">' +
      (showName ? '<div class="avatar">' + initial(name(a.customerId)) + '</div>' : '') +
      '<div class="grow"><div class="t1">' + main + '</div>' + (tags.length ? '<div class="t2">' + esc(tags.join('・')) + '</div>' : '') + '</div>' +
      (showName ? badgeFor(a.customerId, a.date) : '') +
      '<button class="x" aria-label="' + esc(t('deleteEntryTitle')) + '" ' + on('main', function () {
        confirmSlide(t('deleteEntryTitle'), name(a.customerId) + '\n' + fmtDate(a.date), t('slideDelete'), function () {
          BM.removeAttendance(db, a.id); save(); render(); toast(t('deleted'));
        });
      }) + '>' + icon('x') + '</button></div>';
  }

  function backPill(label, fn) { return '<button class="pill back" ' + on('main', fn) + '>' + icon('back') + esc(label) + '</button>'; }

  // ---------- Check in by hand ----------
  function viewManual() {
    const date = view.date || BM.today();
    const q = (view.q || '').toLowerCase();
    const list = db.customers.slice().sort(byName).filter(function (c) { return !q || c.name.toLowerCase().includes(q); });
    let html = backPill(t('navToday'), function () { go('today'); });
    html += '<h1>' + esc(t('byHandTitle')) + '</h1><p class="sub">' + nb(t('byHandSub')) + '</p>';
    html += '<div class="card form"><label for="mdate">' + esc(t('date')) + '</label><input id="mdate" type="date" value="' + esc(date) + '" max="' + esc(BM.today()) + '">' +
      '<label for="mq">' + esc(t('search')) + '</label><input id="mq" type="search" value="' + esc(view.q || '') + '"></div>';
    html += sectionTitle(fmtDate(date)) + '<div class="list">' + list.map(function (c) {
      return '<button class="item" ' + on('main', function () { openActionModal(c.id, date, true); }) + '>' +
        '<div class="avatar">' + initial(c.name) + '</div><div class="grow t1">' + esc(c.name) + '</div>' + badgeFor(c.id, date) + '</button>';
    }).join('') + '</div>';
    setTimeout(function () {
      const d = $('mdate'), s = $('mq');
      if (d) d.onchange = function () { if (d.value) { view.date = d.value; render(); } };
      if (s) s.oninput = function () { view.q = s.value; view.focus = 'mq'; render(); };
    });
    return html;
  }

  function openActionModal(cid, date, manual) {
    REG.modal = {};
    openModal(actionSheet('modal', cid, date, {
      manual: manual,
      close: closeModal,
      done: function (msg, undo, cid, info) {
        closeModal(); render();
        if (info && info.ended) {
          REG.modal = {};
          openModal(endedCard(msg, info, 'modal', closeModal, undo ? function () { undo(); closeModal(); toast(t('undone')); } : null));
          return;
        }
        toast(msg, undo);
      }
    }));
  }

  // ---------- Customers (three views: people · bundles · classes) ----------
  function tabs() {
    const cur = view.tab || 'people';
    return '<div class="seg">' + [['people', t('tabPeople')], ['bundles', t('tabBundles')], ['classes', t('tabClasses')]].map(function (x) {
      return '<button class="' + (cur === x[0] ? 'on' : '') + '" ' + on('main', function () { go('customers', { tab: x[0] }); }) + '>' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
  }

  function pageHead(title, sub, actionHtml) {
    return '<div class="page-head"><div class="grow"><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + esc(sub) + '</p>' : '') + '</div>' + (actionHtml || '') + '</div>';
  }

  function viewCustomers() {
    const tab = view.tab || 'people';
    if (tab === 'bundles') return viewBundles();
    if (tab === 'classes') return viewClasses();
    const today = BM.today();
    const q = (view.q || '').toLowerCase();
    const list = db.customers.slice().sort(byName).filter(function (c) { return !q || c.name.toLowerCase().includes(q); });
    const ended = {};
    BM.endedAtLastClass(db).forEach(function (x) { ended[x.customer.id] = x; });
    let html = pageHead(t('customers'), t('peopleCount', { n: db.customers.length }),
      '<button class="icon-btn" aria-label="' + esc(t('addCustomer')) + '" ' + on('main', editCustomer.bind(null, null)) + '>' + icon('plus') + '</button>') + tabs();
    html += '<input id="cq" class="search" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(view.q || '') + '">';
    html += list.length ? '<div class="list">' + list.map(function (c) {
      const e = ended[c.id];
      const line = e ? (e.reason === 'used' ? t('endedUsedLine', { d: fmtDate(e.date) }) : t('endedExpiredLine', { d: fmtDate(e.date), n: e.unused })) : '';
      return '<button class="item' + (e ? ' flag' : '') + '" ' + on('main', function () { go('customer', { id: c.id }); }) + '>' +
        '<div class="avatar">' + initial(c.name) + '</div><div class="grow"><div class="t1">' + esc(c.name) + '</div>' +
        (e ? '<div class="t2 warn">' + icon('alert') + nb(line) + '</div>' : '') + '</div>' +
        (e ? '<span class="badge warn">' + esc(t('badgeEnded')) + '</span>' : badgeFor(c.id, today)) + icon('next', 'chev') + '</button>';
    }).join('') + '</div>' : '<div class="empty">' + esc(t('noMatch')) + '</div>';
    setTimeout(function () { const s = $('cq'); if (s) s.oninput = function () { view.q = s.value; view.focus = 'cq'; render(); }; });
    return html;
  }

  function viewBundles() {
    const list = BM.activeBundles(db);
    let html = pageHead(t('tabBundles'), t('bundlesSub', { n: list.length })) + tabs();
    if (!list.length) return html + '<div class="empty">' + esc(t('noHistory')) + '</div>';
    html += '<div class="list">' + list.map(function (x) {
      const soon = Math.min(x.stats.ticketsLeft, x.stats.oppLeft) <= 2;
      return '<button class="item" ' + on('main', function () { go('customer', { id: x.customer.id }); }) + '>' +
        '<div class="avatar">' + initial(x.customer.name) + '</div><div class="grow"><div class="t1">' + esc(x.customer.name) + '</div>' +
        '<div class="t2">' + nb(t('bundleOverviewLine', { start: fmtDate(x.bundle.startDate), o: Math.max(0, x.stats.oppLeft) })) + '</div></div>' +
        '<span class="badge' + (soon ? ' warn' : '') + '">' + esc(t('ticketsLeft', { n: x.stats.ticketsLeft })) + '</span></button>';
    }).join('') + '</div>';
    return html;
  }

  function viewClasses() {
    const sessions = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    let html = pageHead(t('tabClasses'), t('classesSub', { n: sessions.length })) + tabs();
    html += '<div class="card form"><label for="newclass">' + esc(t('addClassDate')) + '</label>' +
      '<div class="row"><input id="newclass" type="date" max="' + esc(BM.today()) + '" value="' + esc(BM.today()) + '">' +
      '<button class="btn compact" ' + on('main', function () {
        const d = $('newclass').value; if (!d) return;
        if (BM.hasSession(db, d)) { toast(t('classExists')); return; }
        confirmSlide(t('addClassTitle'), t('addClassText', { d: fmtDate(d) }), t('slideAddClass'), function () {
          BM.addSession(db, d); save(); render(); toast(t('classAdded', { d: fmtDate(d) }));
        }, 'go');
      }) + '>' + esc(t('add')) + '</button></div></div>';
    html += '<div class="list">' + sessions.map(function (s) {
      const people = db.attendance.filter(function (a) { return a.date === s.date; }).map(function (a) { return name(a.customerId); });
      return '<div class="item"><div class="grow"><div class="t1">' + esc(fmtDate(s.date)) + '<span class="count">' + people.length + '</span></div>' +
        '<div class="t2">' + (people.length ? esc(people.join('、')) : esc(t('nobodyCame'))) + '</div></div>' +
        '<button class="x" aria-label="' + esc(t('deleteClassTitle')) + '" ' + on('main', function () {
          confirmSlide(t('deleteClassTitle'), t('deleteClassQ', { d: fmtDate(s.date) }), t('slideDelete'), function () {
            BM.removeSession(db, s.date); save(); render(); toast(t('deleted'));
          });
        }) + '>' + icon('x') + '</button></div>';
    }).join('') + '</div>';
    return html;
  }

  function editCustomer(cid) {
    const c = cid ? BM.customer(db, cid) : null;
    REG.modal = {};
    openModal('<h3>' + esc(c ? t('editCustomerTitle') : t('addCustomer')) + '</h3>' +
      '<label for="ename">' + esc(t('name')) + '</label><input id="ename" type="text" autocomplete="off" value="' + esc(c ? c.name : '') + '">' +
      '<label for="econtact">' + esc(t('contact')) + '</label><input id="econtact" type="text" autocomplete="off" value="' + esc(c ? c.contact : '') + '">' +
      '<div class="gap"></div>' +
      '<button class="btn primary" ' + on('modal', function () {
        const n = $('ename').value.trim(); if (!n) { $('ename').focus(); return; }
        let target = c;
        if (c) { c.name = n; c.contact = $('econtact').value.trim(); }
        else target = BM.addCustomer(db, n, $('econtact').value);
        save(); closeModal();
        if (!c) { go('customer', { id: target.id }); showQR(target.id); } else { render(); toast(t('saved')); }
      }) + '>' + esc(t('save')) + '</button>' +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('cancel')) + '</button>' +
      (c ? '<div class="danger-zone"><h4>' + esc(t('deleteCustomer')) + '</h4><p class="small muted">' + esc(t('deleteCustomerQ', { name: c.name })) + '</p>' +
        slider('modal', t('slideDelete'), function () {
          db.attendance = db.attendance.filter(function (a) { return a.customerId !== c.id; });
          db.bundles = db.bundles.filter(function (b) { return b.customerId !== c.id; });
          db.customers = db.customers.filter(function (x) { return x.id !== c.id; });
          save(); closeModal(); go('customers'); toast(t('deleted'));
        }, 'danger') + '</div>' : ''));
    setTimeout(function () { const f = $('ename'); if (f && !c) f.focus(); });
  }

  function viewCustomer() {
    const c = BM.customer(db, view.id);
    if (!c) return viewCustomers();
    const today = BM.today();
    const st = BM.status(db, c.id, today);
    let html = backPill(t('customers'), function () { go('customers'); });
    html += '<div class="person"><div class="avatar xl">' + initial(c.name) + '</div><div class="grow"><h1>' + esc(c.name) + '</h1>' +
      (c.contact ? '<p class="sub">' + esc(c.contact) + '</p>' : '') + '</div></div>';

    if (st.bundle) {
      html += '<div class="card">' + statTiles(st.stats) + stamps(st.bundle, st.stats, false) +
        '<p class="caption">' + nb(t('bundleCaption', { start: fmtDate(st.bundle.startDate), t: st.bundle.ticketsTotal, m: st.bundle.maxOpportunities })) + '</p></div>';
    } else {
      const lb = lastBundle(c.id);
      html += '<div class="card nob">' + icon('ticket') + '<div><div class="t1">' + esc(t('noBundle')) + '</div>' +
        (lb ? '<div class="t2">' + nb(t('lastBundleEnded', { d: fmtDate(lb.startDate) })) + '</div>' : '') + '</div></div>';
    }

    if (st.state === 'checkedIn') html += '<div class="done-today">' + icon('check') + esc(t('doneToday')) + '</div>';
    else html += '<button class="btn big primary" ' + on('main', function () { openActionModal(c.id, today, true); }) + '>' + bl('check', t('checkInToday')) + '</button>';

    const canSell = !st.bundle;
    html += '<div class="tiles">' +
      '<button class="tile" ' + on('main', function () { showQR(c.id); }) + '>' + icon('qr') + '<span>' + esc(t('tileQR')) + '</span></button>' +
      '<button class="tile" ' + on('main', function () { showReport(c.id); }) + '>' + icon('send') + '<span>' + esc(t('tileReport')) + '</span></button>' +
      '<button class="tile' + (canSell ? '' : ' off') + '" ' + on('main', function () {
        if (!canSell) { toast(t('sellBlocked', { n: st.stats.ticketsLeft })); return; }
        const b = BM.sellBundle(db, c.id, today); save(); render();
        toast(t('bundleSold', { name: c.name }), function () { BM.removeBundle(db, b.id); save(); render(); });
      }) + '>' + icon('ticket') + '<span>' + esc(t('tileSell')) + '</span></button>' +
      '<button class="tile" ' + on('main', function () { editCustomer(c.id); }) + '>' + icon('edit') + '<span>' + esc(t('tileEdit')) + '</span></button>' +
      '</div>';

    const bundles = BM.customerBundles(db, c.id).reverse();
    html += sectionTitle(t('bundles'));
    html += bundles.length ? '<div class="list">' + bundles.map(function (b) {
      const s = BM.bundleStats(db, b, today), active = st.bundle && st.bundle.id === b.id;
      return '<button class="item' + (active ? '' : ' dim') + '" ' + on('main', function () { editBundle(b.id); }) + '>' +
        '<div class="grow"><div class="t1">' + esc(t('bundleRowTitle', { start: fmtDate(b.startDate), t: b.ticketsTotal })) + '</div>' +
        '<div class="t2">' + nb(active ? t('statusLine', { n: s.ticketsLeft, o: Math.max(0, s.oppLeft) }) : t('bundleRowEnded', { a: s.attended, t: b.ticketsTotal })) + '</div></div>' +
        '<span class="chip' + (active ? ' live' : '') + '">' + esc(active ? t('inUse') : t('ended')) + '</span>' + icon('next', 'chev') + '</button>';
    }).join('') + '</div>' : '<div class="empty">' + esc(t('noHistory')) + '</div>';

    const hist = db.attendance.filter(function (a) { return a.customerId === c.id; })
      .sort(function (x, y) { return x.date < y.date ? 1 : -1; });
    html += sectionTitle(t('history'), String(hist.length));
    html += hist.length ? '<div class="list">' + hist.map(function (a) { return attendanceRow(a, false); }).join('') + '</div>'
      : '<div class="empty">' + esc(t('noHistory')) + '</div>';
    return html;
  }

  function editBundle(id) {
    const b = db.bundles.find(function (x) { return x.id === id; });
    if (!b) return;
    const used = db.attendance.filter(function (a) { return a.bundleId === id; }).length;
    REG.modal = {};
    openModal('<h3>' + esc(t('editBundle')) + '</h3><p class="status">' + esc(name(b.customerId)) + '</p>' +
      '<label for="bstart">' + esc(t('startDate')) + '</label><input id="bstart" type="date" value="' + esc(b.startDate) + '">' +
      '<div class="two"><div><label for="btickets">' + esc(t('ticketsTotal')) + '</label><input id="btickets" type="number" inputmode="numeric" min="1" value="' + esc(b.ticketsTotal) + '"></div>' +
      '<div><label for="bwindow">' + esc(t('maxOpportunities')) + '</label><input id="bwindow" type="number" inputmode="numeric" min="1" value="' + esc(b.maxOpportunities) + '"></div></div>' +
      '<p class="small muted">' + esc(t('extendNote')) + '</p>' +
      '<button class="btn primary" ' + on('modal', function () {
        BM.updateBundle(db, id, { startDate: $('bstart').value, ticketsTotal: $('btickets').value, maxOpportunities: $('bwindow').value });
        save(); closeModal(); render(); toast(t('saved'));
      }) + '>' + esc(t('save')) + '</button>' +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('cancel')) + '</button>' +
      '<div class="danger-zone"><h4>' + esc(t('deleteBundle')) + '</h4><p class="small muted">' + esc(t('deleteBundleQ', { n: used })) + '</p>' +
      slider('modal', t('slideDelete'), function () {
        BM.removeBundle(db, id); save(); closeModal(); render(); toast(t('deleted'));
      }, 'danger') + '</div>');
  }

  // ---------- usage report text (numbers only; Marei writes the greeting) ----------
  function reportText(cid, L) {
    const r = BM.usageReport(db, cid);
    const T = I18N[L];
    if (!r) return T.rNoBundle;
    const fill = function (s, v) { Object.keys(v).forEach(function (k) { s = s.split('{' + k + '}').join(v[k]); }); return s; };
    const lines = [
      fill(T.rBundle, { t: r.bundle.ticketsTotal, d: fmtDate(r.bundle.startDate, L) }),
      fill(T.rLeft, { n: r.stats.ticketsLeft }),
      fill(T.rWindow, { n: Math.max(0, r.stats.oppLeft) }),
      '',
      fill(T.rCame, { n: r.came.length })
    ];
    r.came.forEach(function (d) { lines.push(T.rBullet + fmtDate(d, L)); });
    lines.push('', fill(T.rMissed, { n: r.missed.length }));
    r.missed.forEach(function (d) { lines.push(T.rBullet + fmtDate(d, L)); });
    if (!r.missed.length) lines.push(T.rNone);
    return lines.join('\n');
  }

  function showReport(cid) {
    let L = 'ja';
    try { L = localStorage.getItem('bm.reportLang') || 'ja'; } catch (e) { /* ignore */ }
    const draw = function () {
      REG.modal = {};
      const text = reportText(cid, L);
      openModal('<h3>' + esc(name(cid)) + '</h3>' +
        '<div class="seg" style="margin:10px 0">' + ['ja', 'en'].map(function (l) {
          return '<button class="' + (L === l ? 'on' : '') + '" ' + on('modal', function () {
            L = l; try { localStorage.setItem('bm.reportLang', l); } catch (e) { /* ignore */ }
            draw();
          }) + '>' + (l === 'ja' ? '日本語' : 'English') + '</button>';
        }).join('') + '</div>' +
        '<textarea id="rtext" class="report" readonly>' + esc(text) + '</textarea>' +
        '<div class="grid2">' +
        '<button class="btn primary" ' + on('modal', function () { copyText(text); }) + '>' + esc(t('copy')) + '</button>' +
        '<button class="btn" ' + on('modal', function () {
          if (navigator.share) navigator.share({ text: text }).catch(function () {}); else copyText(text);
        }) + '>' + esc(t('shareText')) + '</button></div>' +
        '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('close')) + '</button>');
    };
    draw();
  }

  function copyText(text) {
    const ok = function () { toast(t('copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () { fallbackCopy(text) && ok(); });
    } else if (fallbackCopy(text)) ok();
  }
  function fallbackCopy(text) {
    const ta = $('rtext') || document.createElement('textarea');
    if (!ta.parentNode) { ta.value = text; document.body.appendChild(ta); }
    ta.removeAttribute('readonly'); ta.select(); ta.setSelectionRange(0, text.length);
    let done = false; try { done = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.setAttribute('readonly', ''); return done;
  }

  // ---------- QR cards ----------
  function qrFor(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q; }

  // The card a customer keeps: castle logo, QR code, their name.
  const LOGO = new Image(); LOGO.src = 'icons/logo.png';
  function qrCanvas(c) {
    const q = qrFor(c.id), cell = 10, n = q.getModuleCount(), pad = 40, qs = n * cell;
    const logoH = LOGO.complete && LOGO.naturalWidth ? 120 : 0;
    const W = qs + pad * 2, top = pad + (logoH ? logoH + 44 : 30), H = top + qs + 96;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    if (logoH) x.drawImage(LOGO, (W - logoH) / 2, pad - 8, logoH, logoH);
    x.font = '600 20px -apple-system, "Hiragino Sans", sans-serif'; x.fillStyle = '#1d4b8f';
    x.fillText('Body Making', W / 2, top - 14);
    x.fillStyle = '#14233a';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(pad + k * cell, top + r * cell, cell, cell);
    x.font = '700 32px -apple-system, "Hiragino Sans", sans-serif';
    x.fillText(c.name, W / 2, top + qs + 60);
    return cv;
  }

  function showQR(cid) {
    const c = BM.customer(db, cid);
    const url = qrCanvas(c).toDataURL('image/png');
    REG.modal = {};
    openModal('<div class="qr-box"><img alt="QR" src="' + url + '"></div><div style="height:12px"></div>' +
      '<button class="btn primary" ' + on('modal', function () {
        qrCanvas(c).toBlob(function (blob) { shareFile(new File([blob], 'QR-' + c.name + '.png', { type: 'image/png' })); });
      }) + '>' + esc(t('shareQR')) + '</button>' +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('close')) + '</button>');
  }

  // ---------- files: share sheet with download fallback ----------
  function shareFile(file) {
    const tryTypes = [file];
    if (file.type === 'application/json') tryTypes.push(new File([file], file.name, { type: 'text/plain' }));
    for (let i = 0; i < tryTypes.length; i++) {
      const f = tryTypes[i];
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f], title: f.name }).then(function () { return true; })
          .catch(function (e) { if (e && e.name === 'AbortError') return false; return download(f); });
      }
    }
    return Promise.resolve(download(file));
  }
  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  }

  function saveBackup() {
    const stamp = new Date().toISOString();
    const file = new File([JSON.stringify(BM.backupPayload(db), null, 1)], 'bodymaking-backup-' + BM.today() + '.json', { type: 'application/json' });
    shareFile(file).then(function (ok) {
      if (!ok) return;
      db.meta.lastBackup = stamp; save(); render();
    });
  }

  function exportCSV() {
    shareFile(new File(['﻿' + BM.attendanceCSV(db)], 'bodymaking-checkins-' + BM.today() + '.csv', { type: 'text/csv' }));
  }

  function restorePick() {
    // iPhone only reports the chosen file if the picker is attached to the page.
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.style.position = 'fixed'; inp.style.left = '-9999px'; inp.style.opacity = '0';
    document.body.appendChild(inp);
    let handled = false;
    const handle = function () {
      if (handled) return;
      const f = inp.files && inp.files[0]; if (!f) return;
      handled = true;
      readText(f).then(function (txt) {
        inp.remove();
        let next;
        try { next = BM.fromBackup(JSON.parse(txt)); } catch (e) { alert(t('badFile') + '\n(' + e.message + ')'); return; }
        confirmSlide(t('restore'), t('restoreQ', { c: next.customers.length, a: next.attendance.length }), t('slideReplace'), function () {
          try { localStorage.setItem('bm.db.beforeRestore', JSON.stringify(db)); } catch (e) { /* ignore */ }
          db = next; save(); render(); toast(t('restored'));
        });
      }).catch(function (e) { inp.remove(); alert(t('badFile') + '\n(' + (e && e.message) + ')'); });
    };
    inp.addEventListener('change', handle);
    inp.addEventListener('input', handle);
    inp.click();
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise(function (res, rej) {
      const r = new FileReader();
      r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      r.readAsText(file);
    });
  }

  // ---------- Settings ----------
  function row(ic, title, sub, fn, chev) {
    return '<button class="item" ' + on('main', fn) + '>' + '<span class="row-ic">' + icon(ic) + '</span>' +
      '<div class="grow"><div class="t1">' + esc(title) + '</div>' + (sub ? '<div class="t2">' + esc(sub) + '</div>' : '') + '</div>' +
      (chev === false ? '' : icon('next', 'chev')) + '</button>';
  }

  function viewSettings() {
    let html = pageHead(t('settings'));

    html += sectionTitle(t('secPractice')) + '<div class="list">' +
      row('camera', t('practiceScan'), t('practiceSub'), function () { openScanner(true); }) + '</div>';

    html += sectionTitle(t('language')) + '<div class="seg">' +
      ['ja', 'en'].map(function (l) {
        return '<button class="' + (lang === l ? 'on' : '') + '" ' + on('main', function () {
          lang = l; try { localStorage.setItem(KEY_LANG, l); } catch (e) { /* ignore */ }
          document.documentElement.lang = l; render();
        }) + '>' + (l === 'ja' ? '日本語' : 'English') + '</button>';
      }).join('') + '</div>';

    html += sectionTitle(t('backup')) + backupNotice() +
      '<button class="btn primary" ' + on('main', saveBackup) + '>' + bl('upload', t('saveBackup'), t('saveBackupSub')) + '</button>' +
      '<div class="list">' + row('download', t('restore'), t('restoreSub'), restorePick) + row('table', t('exportCSV'), t('exportCSVSub'), exportCSV) + '</div>';

    const cfg = db.config;
    const field = function (k, v) {
      return '<div><label for="cfg-' + k + '">' + esc(t(k)) + '</label><input id="cfg-' + k + '" data-cfg="' + k + '" type="number" inputmode="numeric" min="1" value="' + esc(v) + '"></div>';
    };
    html += sectionTitle(t('rules')) + '<div class="card form"><div class="two">' +
      field('singlePrice', cfg.singlePrice) + field('bundlePrice', cfg.bundlePrice) +
      field('ticketsTotal', cfg.ticketsTotal) + field('maxOpportunities', cfg.maxOpportunities) +
      '</div><p class="small muted">' + esc(t('rulesNote')) + '</p></div>';

    html += sectionTitle(t('secApp')) + '<div class="list">' +
      '<div class="item"><span class="row-ic">' + icon('shield') + '</span><div class="grow"><div class="t1">' + esc(isStandalone() ? t('storageSafe') : t('storageUnsafe')) + '</div></div></div>' +
      row('refresh', t('updateNow'), t('version', { v: APP_VERSION }), updateNow) + '</div>';

    setTimeout(function () {
      document.querySelectorAll('[data-cfg]').forEach(function (inp) {
        inp.onchange = function () {
          const v = Number(inp.value);
          if (v > 0) { db.config[inp.dataset.cfg] = v; save(); toast(t('saved')); }
        };
      });
    });
    return html;
  }

  // ---------- Scanner ----------
  let stream = null, scanning = false, cardOpen = false, lastCode = '', lastAt = 0, loopTimer = null, practice = false;
  let cams = [], camLabel = '', detector = null, detectBusy = false;
  const KEY_CAM = 'bm.cam';

  // Android Chrome has the phone's own QR reader built in (BarcodeDetector):
  // much better with real, slightly blurry pictures. iPhone Safari doesn't
  // offer it, so there the app uses jsQR.
  try {
    if ('BarcodeDetector' in window) {
      BarcodeDetector.getSupportedFormats().then(function (f) {
        if (f.indexOf('qr_code') >= 0) detector = new BarcodeDetector({ formats: ['qr_code'] });
      }).catch(function () {});
    }
  } catch (e) { /* ignore */ }

  // iPhone: ZXing (the engine many scanner apps use), bundled in the app —
  // the .wasm file is served from this site, never from an outside server.
  let zxReady = false, zxBusy = false, lastEngine = '';
  const ZX_OPTS = { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 };
  function prepareZXing() {
    if (zxReady || !window.ZXingWASM || !window.WebAssembly) return;
    try {
      const p = ZXingWASM.prepareZXingModule({
        overrides: {
          locateFile: function (path, prefix) {
            return path.endsWith('.wasm') ? new URL('vendor/zxing_reader.wasm', location.href).href : prefix + path;
          }
        },
        fireImmediately: true
      });
      Promise.resolve(p).then(function () { zxReady = true; }).catch(function (e) { console.warn('zxing', e); });
    } catch (e) { console.warn('zxing', e); }
  }
  function engineName() { return detector ? 'native' : zxReady ? 'ZXing' : 'jsQR'; }

  function openScanner(practiceMode) {
    prepareZXing();
    practice = !!practiceMode;
    unlockAudio();
    frameNo = 0; noVideoSince = 0;
    $('toast').hidden = true;
    $('scanner').hidden = false;
    $('scanner').classList.toggle('practice', practice);
    $('scanHint').textContent = practice ? t('practiceHint') : t('pointCamera');
    $('scanSnap').hidden = !practice;
    $('scanSwitch').hidden = true;
    setDiag(t('diagStarting'));
    hideCard();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showCameraError(); return; }
    let saved = null;
    try { saved = localStorage.getItem(KEY_CAM); } catch (e) { /* ignore */ }
    (saved ? startCamera(saved).catch(function () { return startCamera(null); }) : startCamera(null))
      .then(function () { scanning = true; tick(); })
      .catch(function (e) { console.error(e); showCameraError(); });
  }

  function startCamera(deviceId) {
    stopStream();
    const video = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
    video.width = { ideal: 1920 }; video.height = { ideal: 1080 };
    return navigator.mediaDevices.getUserMedia({ video: video, audio: false }).then(function (s) {
      stream = s;
      const track = s.getVideoTracks()[0];
      camLabel = track.label || '';
      // keep autofocus running where the phone allows it
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
        }
      } catch (e) { /* ignore */ }
      const v = $('video'); v.srcObject = s;
      return navigator.mediaDevices.enumerateDevices().then(function (d) {
        cams = d.filter(function (x) { return x.kind === 'videoinput'; });
        $('scanSwitch').hidden = cams.length < 2;
      }).catch(function () { /* ignore */ }).then(function () { return v.play(); });
    });
  }

  function stopStream() { if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); }); stream = null; }

  // Phones with several back lenses: try the next one (remembered for next time).
  function switchCamera() {
    if (cams.length < 2) return;
    let curId = '';
    try { curId = stream.getVideoTracks()[0].getSettings().deviceId; } catch (e) { /* ignore */ }
    const i = cams.findIndex(function (c) { return c.deviceId === curId; });
    const next = cams[(i + 1) % cams.length];
    scanning = false; clearTimeout(loopTimer);
    setDiag(t('diagStarting'));
    startCamera(next.deviceId).then(function () {
      try { localStorage.setItem(KEY_CAM, next.deviceId); } catch (e) { /* ignore */ }
      scanning = true; frameNo = 0; tick();
    }).catch(function () { showCameraError(); });
  }
  $('scanSwitch').onclick = switchCamera;

  function showCameraError() {
    showCard(() => '<p class="status">' + esc(t('cameraError')) + '</p>' +
      '<button class="btn primary" ' + on('card', function () { hideCard(); photoScan(); }) + '>' + esc(t('photoScan')) + '</button>' +
      '<button class="btn ghost" ' + on('card', closeScanner) + '>' + esc(t('close')) + '</button>');
  }

  function closeScanner() {
    scanning = false; practice = false; clearTimeout(loopTimer);
    stopStream();
    $('scanner').hidden = true; hideCard();
    render();
  }
  $('scanClose').onclick = closeScanner;

  function shortLabel() { const l = camLabel || '?'; return l.length > 26 ? l.slice(0, 26) + '…' : l; }

  // jsQR path: each frame alternates between two looks at the picture —
  //  even frames: the middle of the picture at full detail (card 20-30 cm away);
  //  odd frames:  the whole picture, scaled down (card close / big).
  let frameNo = 0, noVideoSince = 0;
  function tick() {
    if (!scanning) return;
    loopTimer = setTimeout(tick, 120);
    if (cardOpen) return;
    const v = $('video');
    const tr = stream && stream.getVideoTracks()[0];
    if (tr && tr.readyState === 'ended') {             // e.g. after the photo camera took over
      scanning = false;
      startCamera(null).then(function () { scanning = true; tick(); }).catch(showCameraError);
      return;
    }
    if (v.paused) v.play().catch(function () {});
    if (!v.videoWidth) {
      if (!noVideoSince) noVideoSince = Date.now();
      if (Date.now() - noVideoSince > 4000) setDiag(t('diagNoVideo'));
      return;
    }
    noVideoSince = 0;
    frameNo++;
    const vw = v.videoWidth, vh = v.videoHeight;
    if (frameNo % 5 === 0) setDiag(t('diagRunning', { cam: shortLabel(), w: vw, h: vh, n: frameNo, e: engineName() }));

    if (detector) {
      if (detectBusy) return;
      detectBusy = true;
      detector.detect(v).then(function (codes) {
        detectBusy = false;
        if (codes && codes.length && codes[0].rawValue) { lastEngine = 'native'; handleCode(codes[0].rawValue); }
      }).catch(function () { detectBusy = false; detector = null; });   // fall back to ZXing / jsQR
      return;
    }
    if (zxReady && zxBusy) return;

    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (frameNo % 2 === 0) {
      const side = Math.round(Math.min(vw, vh) * 0.7);
      sx = Math.round((vw - side) / 2); sy = Math.round((vh - side) / 2); sw = sh = side;
    }
    const scale = Math.min(1, 800 / Math.max(sw, sh));
    const w = Math.round(sw * scale), h = Math.round(sh * scale);
    const cv = $('canvas');
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    if (zxReady) {
      zxBusy = true;
      ZXingWASM.readBarcodes(img, ZX_OPTS).then(function (r) {
        zxBusy = false;
        const hit = r && r.find(function (x) { return x.isValid && x.text; });
        if (hit) { lastEngine = 'ZXing'; handleCode(hit.text); }
      }).catch(function (e) { zxBusy = false; zxReady = false; console.warn('zxing', e); });   // fall back to jsQR
      return;
    }
    const res = jsQR(img.data, w, h, { inversionAttempts: frameNo % 4 < 2 ? 'dontInvert' : 'attemptBoth' });
    if (res && res.data) { lastEngine = 'jsQR'; handleCode(res.data); }
  }

  function handleCode(raw) {
    const code = String(raw).trim();
    if (!code || cardOpen) return;
    if (code === lastCode && Date.now() - lastAt < 3000) return;
    lastCode = code; lastAt = Date.now();
    found();
    setDiag(t('diagFound', { code: code.length > 24 ? code.slice(0, 24) + '…' : code }));
    onScan(code);
  }

  // ---------- read from a photo (the phone's own camera app focuses properly) ----------
  function photoScan() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment');
    inp.style.position = 'fixed'; inp.style.left = '-9999px'; inp.style.opacity = '0';
    document.body.appendChild(inp);
    let done = false;
    const handle = function () {
      if (done) return;
      const f = inp.files && inp.files[0]; if (!f) return;
      done = true; inp.remove();
      setDiag(t('diagPhoto'));
      decodeImageFile(f).then(function (code) {
        if (code) { lastCode = ''; handleCode(code); return; }
        showCard(() => '<div class="success"><div class="big-check info">' + icon('alert') + '</div><h3>' + esc(t('photoFail')) + '</h3>' +
          '<p class="status">' + esc(t('photoFailTip')) + '</p>' +
          '<button class="btn primary" ' + on('card', function () { hideCard(); photoScan(); }) + '>' + esc(t('photoAgain')) + '</button>' +
          '<button class="btn ghost" ' + on('card', hideCard) + '>' + esc(t('close')) + '</button></div>');
      });
    };
    inp.addEventListener('change', handle);
    inp.addEventListener('input', handle);
    inp.click();
  }
  $('scanPhoto').onclick = photoScan;

  function decodeImageFile(file) {
    return loadImage(file).then(function (img) {
      const sizes = [1600, 1000, 600];
      const attempt = function (k) {
        if (k >= sizes.length) return null;
        const s = Math.min(1, sizes[k] / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, c.width, c.height);
        const native = detector
          ? detector.detect(c).then(function (r) { return r && r.length ? r[0].rawValue : null; }).catch(function () { return null; })
          : Promise.resolve(null);
        return native.then(function (code) {
          if (code) return code;
          const id = x.getImageData(0, 0, c.width, c.height);
          const zx = zxReady
            ? ZXingWASM.readBarcodes(id, ZX_OPTS).then(function (r) { const h = r && r.find(function (y) { return y.isValid && y.text; }); return h ? h.text : null; }).catch(function () { return null; })
            : Promise.resolve(null);
          return zx.then(function (z) {
            if (z) return z;
            const r = jsQR(id.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
            return r && r.data ? r.data : attempt(k + 1);
          });
        });
      };
      return attempt(0);
    }).catch(function (e) { console.error(e); return null; });
  }
  function loadImage(file) {
    const viaEl = function () {
      return new Promise(function (res, rej) {
        const u = URL.createObjectURL(file), i = new Image();
        i.onload = function () { res(i); }; i.onerror = rej; i.src = u;
      });
    };
    if (window.createImageBitmap) return createImageBitmap(file).catch(viaEl);
    return viaEl();
  }

  // ---------- test picture: what the camera sees, to send to Claude ----------
  function snapshot() {
    const v = $('video'); if (!v.videoWidth) return;
    const s = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    const x = c.getContext('2d');
    x.drawImage(v, 0, 0, c.width, c.height);
    x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(0, 0, c.width, 30);
    x.fillStyle = '#fff'; x.font = '15px sans-serif';
    x.fillText('v' + APP_VERSION + ' · ' + camLabel + ' · ' + v.videoWidth + 'x' + v.videoHeight + ' · ' + engineName() + ' · frames ' + frameNo, 8, 20);
    c.toBlob(function (b) { shareFile(new File([b], 'scan-test-' + BM.today() + '.png', { type: 'image/png' })); });
  }
  $('scanSnap').onclick = snapshot;

  function setDiag(text) { const d = $('scanDiag'); if (d) { d.textContent = text; d.hidden = false; } }

  // Beep + green flash when a code is read. (The beep is silent if the
  // iPhone's ring/silent switch is on silent; the flash always shows.)
  let audio = null;
  function unlockAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function found() {
    const f = document.querySelector('.scan-frame');
    if (f) { f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit'); }
    beep(1320);
  }
  function beep(freq) {
    if (!audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.value = 0.15;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.14);
    } catch (e) { /* ignore */ }
  }

  function onScan(code) {
    const c = BM.customer(db, code);
    if (!c) {
      showCard(() => '<div class="success"><div class="big-check info">' + icon('alert') + '</div><h3>' + esc(t('unknownCard')) + '</h3>' +
        '<button class="btn primary" ' + on('card', hideCard) + '>' + esc(t('close')) + '</button></div>');
      return;
    }
    const today = BM.today();
    showCard(() => actionSheet('card', c.id, today, {
      manual: false,
      fromScanner: true,
      close: hideCard,
      done: function (msg, undo, cid, info) {
        const st = BM.status(db, cid, today);
        if (info && info.ended) {
          beep(880); setTimeout(function () { beep(660); }, 220);   // two-tone: different from a normal check-in
          showCard(() => endedCard(msg, info, 'card', hideCard, undo ? function () { undo(); hideCard(); toast(t('undone')); } : null));
          return;   // stays until Marei taps OK
        }
        showCard(() => '<div class="success"><div class="big-check">' + icon('check') + '</div><h3>' + esc(msg) + '</h3>' +
          (st.stats ? '<p class="status">' + esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) + '</p>' : '<p class="status"></p>') +
          '<button class="btn primary" ' + on('card', hideCard) + '>' + esc(t('done')) + '</button>' +
          (undo ? '<button class="btn ghost" ' + on('card', function () { undo(); hideCard(); toast(t('undone')); }) + '>' + esc(t('undo')) + '</button>' : '') + '</div>');
        clearTimeout(successTimer);
        successTimer = setTimeout(function () { if (cardOpen) hideCard(); }, 2500);
      }
    }));
  }
  let successTimer = null;

  // Takes a function that builds the HTML, so its buttons register after the reset.
  function showCard(build) {
    REG.card = {};
    const html = build();
    clearTimeout(successTimer);
    const el = $('scanCard'); el.innerHTML = html; el.hidden = false; cardOpen = true;
    $('scanBottom').hidden = true;
  }
  function hideCard() {
    clearTimeout(successTimer);
    $('scanCard').hidden = true; cardOpen = false; lastAt = Date.now();
    $('scanBottom').hidden = false;
  }

  // ---------- missed-class reminder ----------
  // Asked when the app opens and no class was saved for over 2 weeks.
  function askMissedClasses() {
    if (scanning || !$('modal').hidden) return;
    const dates = BM.missingClassDates(db);
    if (!dates.length) return;
    REG.modal = {};
    const last = db.sessions.map(function (x) { return x.date; }).sort().pop();
    openModal('<h3>' + esc(t('missedTitle')) + '</h3>' +
      '<p class="status">' + esc(t('missedText', { d: fmtDate(last) })) + '</p>' +
      '<div class="list">' + dates.map(function (d) {
        return '<label class="item check"><input type="checkbox" value="' + esc(d) + '"><span class="grow">' + esc(fmtDate(d)) + '</span></label>';
      }).join('') + '</div><div style="height:14px"></div>' +
      '<button class="btn primary" ' + on('modal', function () {
        const ticked = Array.prototype.map.call(document.querySelectorAll('#modal input[type=checkbox]:checked'), function (i) { return i.value; });
        BM.answerMissingClasses(db, ticked); save(); closeModal(); render();
        toast(t('missedSaved', { n: ticked.length }));
      }) + '>' + esc(t('save')) + '<small>' + esc(t('missedNone')) + '</small></button>' +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('later')) + '</button>');
  }

  // ---------- updates ----------
  let swReg = null;
  function checkForUpdate() { if (swReg) swReg.update().catch(function () {}); }
  function updateNow() {
    toast(t('updating'));
    const go = function () { location.reload(); };
    const clear = window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve();
    (swReg ? swReg.update().catch(function () {}) : Promise.resolve()).then(function () { return clear; }).then(go, go);
  }

  // ---------- boot ----------
  [['scanPhoto', 'camera', 'photoScan'], ['scanSwitch', 'swap', 'switchCam'], ['scanSnap', 'image', 'snapshot']].forEach(function (b) {
    $(b[0]).innerHTML = icon(b[1]) + '<span data-t="' + b[2] + '"></span>';
  });
  $('scanClose').innerHTML = icon('x');
  document.documentElement.lang = lang;
  render();
  askMissedClasses();
  setTimeout(prepareZXing, 1500);   // load the reader early so the first scan is quick
  // iPhone home-screen apps resume instead of reloading, so ask on resume too.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { render(); askMissedClasses(); checkForUpdate(); }
  });

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () {});
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) { swReg = reg; })
      .catch(function (e) { console.warn('sw', e); });
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller; // first install: no reload needed
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController) return;
      // Pick up a new version, but never in the middle of scanning.
      if (reloaded) return;
      const doReload = function () { if (!scanning) { reloaded = true; location.reload(); } else setTimeout(doReload, 5000); };
      doReload();
    });
  }

  // test hook (used by tests/ui.test.py only)
  window.__bm = { get db() { return db; }, onScan: onScan, openScanner: openScanner, go: go, engine: function () { return lastEngine + '/' + engineName(); } };
})();
