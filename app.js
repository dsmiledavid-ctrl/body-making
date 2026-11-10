// Body Making check-in — screens and phone plumbing.
// The class rules live in logic.js; this file only draws screens and saves.
(function () {
  'use strict';

  const APP_VERSION = '1.2.0';
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
  function fmtDate(iso) {
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    const wd = t('days')[d.getDay()];
    if (lang === 'ja') return (p[1]) + '月' + p[2] + '日（' + wd + '）';
    const mon = d.toLocaleString('en-GB', { month: 'short' });
    return wd + ' ' + p[2] + ' ' + mon + (p[0] !== new Date().getFullYear() ? ' ' + p[0] : '');
  }
  function fmtFt(n) { return Number(n || 0).toLocaleString('hu-HU'); }
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
  function closeModal() { $('modal').hidden = true; REG.modal = {}; }
  $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });

  // ---------- navigation ----------
  let view = { name: 'today' };
  function go(name, params) { view = Object.assign({ name: name }, params || {}); render(); window.scrollTo(0, 0); }

  function renderNav() {
    const tabs = [['today', '◎', t('navToday')], ['customers', '☺', t('navCustomers')], ['settings', '⚙', t('navSettings')]];
    REG.nav = {};
    $('nav').innerHTML = tabs.map(function (tb) {
      const active = view.name === tb[0] || (tb[0] === 'customers' && view.name === 'customer') || (tb[0] === 'today' && view.name === 'manual');
      return '<button class="' + (active ? 'on' : '') + '" ' + navOn(tb[0]) + '><span class="ic">' + tb[1] + '</span>' + esc(tb[2]) + '</button>';
    }).join('');
  }
  function navOn(name) { const id = 'n' + name; REG.nav[id] = function () { go(name); }; return 'data-r="nav" data-a="' + id + '"'; }

  function render() {
    REG.main = {};
    const fn = { today: viewToday, customers: viewCustomers, customer: viewCustomer, manual: viewManual, settings: viewSettings }[view.name] || viewToday;
    $('app').innerHTML = fn();
    renderNav();
    if (view.focus) { const f = $(view.focus); if (f) f.focus(); view.focus = null; }
  }

  // ---------- the action sheet (shared by scanner, hand check-in, customer page) ----------
  // Shows exactly the buttons that make sense for this person on this date.
  function actionSheet(region, cid, date, ctx) {
    const c = BM.customer(db, cid);
    const st = BM.status(db, cid, date);
    const isToday = date === BM.today();
    const head = '<h3>' + esc(c.name) + '</h3>' + (isToday ? '' : '<p class="status">' + esc(fmtDate(date)) + '</p>');

    if (st.state === 'checkedIn') {
      return '<div class="success">' +
        '<div class="big-check info">✓</div>' + head +
        '<p class="status">' + esc(t('alreadyIn')) + (st.stats ? ' · ' + esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) : '') + '</p>' +
        '<button class="btn primary" ' + on(region, ctx.close) + '>' + esc(t('close')) + '</button></div>';
    }

    function act(kind) {
      return on(region, function () {
        const keys = { in: 'okIn', single: 'okSingle', bundle: 'okBundle' };
        if (practice) { ctx.done(t(keys[kind], { name: c.name }) + ' ' + t('practiceTag'), null, cid); return; }
        if (!ensureSession(date)) return;
        let created, msgKey;
        try {
          if (kind === 'in') { created = [BM.checkIn(db, cid, date, { manual: ctx.manual })]; msgKey = 'okIn'; }
          if (kind === 'single') { created = [BM.sellSingle(db, cid, date, { manual: ctx.manual })]; msgKey = 'okSingle'; }
          if (kind === 'bundle') { const r = BM.sellBundleAndCheckIn(db, cid, date, { manual: ctx.manual }); created = [r.attendance, r.bundle]; msgKey = 'okBundle'; }
        } catch (e) { alert(e.message); return; }
        save();
        const undo = function () {
          created.forEach(function (x) { if (x.startDate) BM.removeBundle(db, x.id); else BM.removeAttendance(db, x.id); });
          save(); render();
        };
        ctx.done(t(msgKey, { name: c.name }), undo, cid);
      });
    }

    if (st.state === 'bundle') {
      const n = st.stats.ticketsLeft;
      return head +
        '<p class="status">' + esc(t('ticketsLeftDetail', { n: n, u: st.stats.oppUsed, m: st.bundle.maxOpportunities })) + '</p>' +
        '<button class="btn big primary" ' + act('in') + '>' + esc(t('checkIn')) + '<small>' + esc(t('checkInUses', { n: n, m: n - 1 })) + '</small></button>' +
        '<button class="btn ghost" ' + on(region, ctx.close) + '>' + esc(t('cancel')) + '</button>';
    }

    return head +
      '<p class="status">' + esc(t('noBundle')) + '</p>' +
      '<button class="btn big primary" ' + act('bundle') + '>' + esc(t('sellBundle')) +
      '<small>' + esc(t('sellBundleSub', { t: db.config.ticketsTotal, p: fmtFt(db.config.bundlePrice) })) + '</small></button>' +
      '<button class="btn ghost" ' + on(region, ctx.close) + '>' + esc(t('cancel')) + '</button>';
  }

  // A check-in needs a class on that date (class dates drive the bundle window).
  function ensureSession(date) {
    if (BM.hasSession(db, date)) return true;
    if (date === BM.today() || confirm(t('noClassOnDate', { d: fmtDate(date) }))) { BM.addSession(db, date); save(); return true; }
    return false;
  }

  function badgeFor(cid, date) {
    const st = BM.status(db, cid, date);
    if (st.state === 'checkedIn') return '<span class="badge ok">✓ ' + (st.stats ? esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) : esc(t('single'))) + '</span>';
    if (st.state === 'bundle') return '<span class="badge">' + esc(t('ticketsLeft', { n: st.stats.ticketsLeft })) + '</span>';
    return '<span class="badge none">' + esc(t('noBundleShort')) + '</span>';
  }

  // ---------- Today ----------
  function backupNotice() {
    const last = db.meta.lastBackup;
    const hasData = db.attendance.length > 0;
    if (!hasData) return '';
    if (!last) return '<div class="notice warn">' + esc(t('neverBackedUp')) + '<button ' + on('main', saveBackup) + '>' + esc(t('backupNow')) + '</button></div>';
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    const txt = days === 0 ? t('lastBackupToday') : t('lastBackup', { d: days });
    if (days > 30) return '<div class="notice warn">' + esc(txt) + '<button ' + on('main', saveBackup) + '>' + esc(t('backupNow')) + '</button></div>';
    return '<div class="notice calm small">' + esc(txt) + '</div>';
  }

  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

  function viewToday() {
    const today = BM.today();
    const started = BM.hasSession(db, today);
    const todays = db.attendance.filter(function (a) { return a.date === today; })
      .sort(function (x, y) { return (y.ts || '') < (x.ts || '') ? -1 : 1; });

    let html = '<img class="logo" src="icons/logo.png" alt="Dance &amp; Smile">' +
      '<h1>' + esc(fmtDate(today)) + '</h1><p class="sub">' + esc(started ? t('classToday') : t('noClassToday')) + '</p>';
    if (!isStandalone()) html += '<div class="notice warn small">' + esc(t('storageUnsafe')) + '</div>';
    html += backupNotice();
    html += '<button class="btn big primary" ' + on('main', function () { BM.addSession(db, today); save(); openScanner(); }) + '>' +
      esc(started ? t('scan') : t('startClass')) + '</button>';
    html += '<button class="btn" ' + on('main', function () { go('manual', { date: today }); }) + '>' + esc(t('byHand')) + '</button>';

    html += '<h2>' + esc(t('checkedInToday', { n: todays.length })) + '</h2>';
    if (!todays.length) html += '<div class="card muted center">' + esc(t('nobodyYet')) + '</div>';
    else html += '<div class="list">' + todays.map(function (a) { return attendanceRow(a, true); }).join('') + '</div>';
    return html;
  }

  function attendanceRow(a, showName) {
    const label = a.type === 'Single' ? t('single') : t('bundle');
    const main = showName ? esc(name(a.customerId)) : esc(fmtDate(a.date));
    const sub = (showName ? '' : '') + esc(label) + (a.manual ? ' · ' + esc(t('handMark')) : '');
    return '<div class="item">' +
      (showName ? '<div class="avatar">' + initial(name(a.customerId)) + '</div>' : '') +
      '<div class="grow"><div>' + main + '</div><div class="small muted">' + sub + '</div></div>' +
      '<button class="x" aria-label="delete" ' + on('main', function () {
        if (!confirm(t('deleteEntry'))) return;
        BM.removeAttendance(db, a.id); save(); render();
      }) + '>✕</button></div>';
  }

  // ---------- Check in by hand ----------
  function viewManual() {
    const date = view.date || BM.today();
    const q = (view.q || '').toLowerCase();
    const list = db.customers.slice().sort(byName).filter(function (c) { return !q || c.name.toLowerCase().includes(q); });
    let html = '<h1>' + esc(t('byHandTitle')) + '</h1>';
    html += '<label for="mdate">' + esc(t('date')) + '</label><input id="mdate" type="date" value="' + esc(date) + '" max="' + esc(BM.today()) + '">';
    html += '<label for="mq">' + esc(t('search')) + '</label><input id="mq" type="search" value="' + esc(view.q || '') + '">';
    html += '<h2>' + esc(fmtDate(date)) + '</h2><div class="list">' + list.map(function (c) {
      return '<button class="item" ' + on('main', function () { openActionModal(c.id, date, true); }) + '>' +
        '<div class="avatar">' + initial(c.name) + '</div><div class="grow">' + esc(c.name) + '</div>' + badgeFor(c.id, date) + '</button>';
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
      done: function (msg, undo) { closeModal(); render(); toast(msg, undo); }
    }));
  }

  // ---------- Customers (three views: people · bundles · classes) ----------
  function tabs() {
    const cur = view.tab || 'people';
    return '<div class="seg" style="margin-bottom:16px">' + [['people', t('tabPeople')], ['bundles', t('tabBundles')], ['classes', t('tabClasses')]].map(function (x) {
      return '<button class="' + (cur === x[0] ? 'on' : '') + '" ' + on('main', function () { go('customers', { tab: x[0] }); }) + '>' + esc(x[1]) + '</button>';
    }).join('') + '</div>';
  }

  function viewCustomers() {
    const tab = view.tab || 'people';
    if (tab === 'bundles') return viewBundles();
    if (tab === 'classes') return viewClasses();
    const today = BM.today();
    const q = (view.q || '').toLowerCase();
    const list = db.customers.slice().sort(byName).filter(function (c) { return !q || c.name.toLowerCase().includes(q); });
    let html = '<h1>' + esc(t('customers')) + '</h1><p class="sub">' + esc(t('peopleCount', { n: db.customers.length })) + '</p>' + tabs();
    html += '<input id="cq" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(view.q || '') + '">';
    html += '<div style="height:12px"></div><button class="btn" ' + on('main', editCustomer.bind(null, null)) + '>' + esc(t('addCustomer')) + '</button><div style="height:12px"></div>';
    html += '<div class="list">' + list.map(function (c) {
      return '<button class="item" ' + on('main', function () { go('customer', { id: c.id }); }) + '>' +
        '<div class="avatar">' + initial(c.name) + '</div><div class="grow">' + esc(c.name) + '</div>' + badgeFor(c.id, today) + '</button>';
    }).join('') + '</div>';
    setTimeout(function () { const s = $('cq'); if (s) s.oninput = function () { view.q = s.value; view.focus = 'cq'; render(); }; });
    return html;
  }

  function viewBundles() {
    const list = BM.activeBundles(db);
    let html = '<h1>' + esc(t('tabBundles')) + '</h1><p class="sub">' + esc(t('bundlesSub', { n: list.length })) + '</p>' + tabs();
    if (!list.length) return html + '<div class="card muted center">' + esc(t('noHistory')) + '</div>';
    html += '<div class="list">' + list.map(function (x) {
      const soon = Math.min(x.stats.ticketsLeft, x.stats.oppLeft) <= 2;
      return '<button class="item" ' + on('main', function () { go('customer', { id: x.customer.id }); }) + '>' +
        '<div class="avatar">' + initial(x.customer.name) + '</div><div class="grow"><div>' + esc(x.customer.name) + '</div>' +
        '<div class="small muted">' + esc(t('bundleOverviewLine', { start: fmtDate(x.bundle.startDate), o: x.stats.oppLeft })) + '</div></div>' +
        '<span class="badge' + (soon ? ' warn' : '') + '">' + esc(t('ticketsLeft', { n: x.stats.ticketsLeft })) + '</span></button>';
    }).join('') + '</div>';
    return html;
  }

  function viewClasses() {
    const sessions = db.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    let html = '<h1>' + esc(t('tabClasses')) + '</h1><p class="sub">' + esc(t('classesSub', { n: sessions.length })) + '</p>' + tabs();
    html += '<div class="card"><label for="newclass" style="margin-top:0">' + esc(t('addClassDate')) + '</label>' +
      '<div class="row"><input id="newclass" type="date" max="' + esc(BM.today()) + '" value="' + esc(BM.today()) + '">' +
      '<button class="btn" style="width:auto;min-height:48px;white-space:nowrap;flex:none" ' + on('main', function () {
        const d = $('newclass').value; if (!d) return;
        if (BM.addSession(db, d)) { save(); render(); toast(t('classAdded', { d: fmtDate(d) })); } else toast(t('classExists'));
      }) + '>' + esc(t('add')) + '</button></div></div>';
    html += '<div class="list">' + sessions.map(function (s) {
      const people = db.attendance.filter(function (a) { return a.date === s.date; }).map(function (a) { return name(a.customerId); });
      return '<div class="item"><div class="grow"><div>' + esc(fmtDate(s.date)) + ' <span class="badge none">' + people.length + '</span></div>' +
        '<div class="small muted">' + (people.length ? esc(people.join('、')) : esc(t('nobodyCame'))) + '</div></div>' +
        '<button class="x" aria-label="delete" ' + on('main', function () {
          if (!confirm(t('deleteClassQ', { d: fmtDate(s.date) }))) return;
          BM.removeSession(db, s.date); save(); render();
        }) + '>✕</button></div>';
    }).join('') + '</div>';
    return html;
  }

  function editCustomer(cid) {
    const c = cid ? BM.customer(db, cid) : null;
    REG.modal = {};
    openModal('<h3>' + esc(c ? t('edit') : t('addCustomer')) + '</h3>' +
      '<label for="ename">' + esc(t('name')) + '</label><input id="ename" type="text" value="' + esc(c ? c.name : '') + '">' +
      '<label for="econtact">' + esc(t('contact')) + '</label><input id="econtact" type="text" value="' + esc(c ? c.contact : '') + '">' +
      '<div style="height:16px"></div>' +
      '<button class="btn primary" ' + on('modal', function () {
        const n = $('ename').value.trim(); if (!n) return;
        let target = c;
        if (c) { c.name = n; c.contact = $('econtact').value.trim(); }
        else target = BM.addCustomer(db, n, $('econtact').value);
        save(); closeModal();
        if (!c) { go('customer', { id: target.id }); showQR(target.id); } else render();
      }) + '>' + esc(t('save')) + '</button>' +
      (c ? '<button class="btn danger" ' + on('modal', function () {
        if (!confirm(t('deleteCustomerQ', { name: c.name }))) return;
        db.attendance = db.attendance.filter(function (a) { return a.customerId !== c.id; });
        db.bundles = db.bundles.filter(function (b) { return b.customerId !== c.id; });
        db.customers = db.customers.filter(function (x) { return x.id !== c.id; });
        save(); closeModal(); go('customers');
      }) + '>' + esc(t('deleteCustomer')) + '</button>' : '') +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('cancel')) + '</button>');
    setTimeout(function () { const f = $('ename'); if (f && !c) f.focus(); });
  }

  function viewCustomer() {
    const c = BM.customer(db, view.id);
    if (!c) return viewCustomers();
    const today = BM.today();
    const st = BM.status(db, c.id, today);
    let html = '<button class="pill" style="background:var(--card)" ' + on('main', function () { go('customers'); }) + '>‹ ' + esc(t('customers')) + '</button>';
    html += '<h1 style="margin-top:14px">' + esc(c.name) + '</h1>';
    html += '<p class="sub">' + (c.contact ? esc(c.contact) + ' · ' : '') + badgeFor(c.id, today) + '</p>';

    if (st.state !== 'checkedIn') {
      html += '<button class="btn primary big" ' + on('main', function () { openActionModal(c.id, today, true); }) + '>' + esc(t('checkInToday')) + '</button>';
    }
    html += '<div class="grid2">' +
      '<button class="btn" ' + on('main', function () { editCustomer(c.id); }) + '>✎ ' + esc(t('editShort')) + '</button>' +
      '<button class="btn" ' + on('main', function () { showQR(c.id); }) + '>' + esc(t('qrShort')) + '</button></div>';
    html += '<button class="btn soft" ' + on('main', function () {
      const b = BM.sellBundle(db, c.id, today); save(); render();
      toast(t('bundleSold', { name: c.name }), function () { BM.removeBundle(db, b.id); save(); render(); });
    }) + '>' + esc(t('sellOnly')) + '<small>' + esc(t('sellOnlySub', { t: db.config.ticketsTotal, p: fmtFt(db.config.bundlePrice) })) + '</small></button>';

    const bundles = BM.customerBundles(db, c.id).reverse();
    html += '<h2>' + esc(t('bundles')) + '</h2>';
    html += bundles.length ? '<div class="list">' + bundles.map(function (b) {
      const s = BM.bundleStats(db, b, today);
      return '<button class="item" ' + on('main', function () { editBundle(b.id); }) + '><div class="grow"><div>' + esc(t('ticketsLeft', { n: s.ticketsLeft })) + '</div><div class="small muted">' +
        esc(t('bundleLine', { start: fmtDate(b.startDate), a: s.attended, t: b.ticketsTotal, u: Math.min(s.oppUsed, b.maxOpportunities), m: b.maxOpportunities })) + '</div></div><span class="muted">✎</span></button>';
    }).join('') + '</div>' : '<div class="card muted center">' + esc(t('noHistory')) + '</div>';

    const hist = db.attendance.filter(function (a) { return a.customerId === c.id; })
      .sort(function (x, y) { return x.date < y.date ? 1 : -1; });
    html += '<h2>' + esc(t('history')) + ' (' + hist.length + ')</h2>';
    html += hist.length ? '<div class="list">' + hist.map(function (a) { return attendanceRow(a, false); }).join('') + '</div>'
      : '<div class="card muted center">' + esc(t('noHistory')) + '</div>';
    return html;
  }

  function editBundle(id) {
    const b = db.bundles.find(function (x) { return x.id === id; });
    if (!b) return;
    const used = db.attendance.filter(function (a) { return a.bundleId === id; }).length;
    REG.modal = {};
    openModal('<h3>' + esc(t('editBundle')) + '</h3><p class="status">' + esc(name(b.customerId)) + '</p>' +
      '<label for="bstart">' + esc(t('startDate')) + '</label><input id="bstart" type="date" value="' + esc(b.startDate) + '">' +
      '<label for="btickets">' + esc(t('ticketsTotal')) + '</label><input id="btickets" type="number" inputmode="numeric" min="1" value="' + esc(b.ticketsTotal) + '">' +
      '<label for="bwindow">' + esc(t('maxOpportunities')) + '</label><input id="bwindow" type="number" inputmode="numeric" min="1" value="' + esc(b.maxOpportunities) + '">' +
      '<p class="small muted">' + esc(t('extendNote')) + '</p>' +
      '<button class="btn primary" ' + on('modal', function () {
        BM.updateBundle(db, id, { startDate: $('bstart').value, ticketsTotal: $('btickets').value, maxOpportunities: $('bwindow').value });
        save(); closeModal(); render(); toast(t('saved'));
      }) + '>' + esc(t('save')) + '</button>' +
      '<button class="btn danger" ' + on('modal', function () {
        if (!confirm(t('deleteBundleQ', { n: used }))) return;
        BM.removeBundle(db, id); save(); closeModal(); render();
      }) + '>' + esc(t('deleteBundle')) + '</button>' +
      '<button class="btn ghost" ' + on('modal', closeModal) + '>' + esc(t('cancel')) + '</button>');
  }

  // ---------- QR cards ----------
  function qrFor(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q; }

  function qrCanvas(c) {
    const q = qrFor(c.id), cell = 10, n = q.getModuleCount(), pad = 40, qs = n * cell;
    const W = qs + pad * 2, H = qs + pad * 2 + 70;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#2b2226';
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(pad + k * cell, pad + r * cell, cell, cell);
    x.font = '600 30px -apple-system, "Hiragino Sans", sans-serif'; x.textAlign = 'center';
    x.fillText(c.name, W / 2, qs + pad + 50);
    x.font = '18px -apple-system, sans-serif'; x.fillStyle = '#b5476b';
    x.fillText('Body Making', W / 2, pad - 12);
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
        if (!confirm(t('restoreQ', { c: next.customers.length, a: next.attendance.length }))) return;
        try { localStorage.setItem('bm.db.beforeRestore', JSON.stringify(db)); } catch (e) { /* ignore */ }
        db = next; save(); render(); toast(t('restored'));
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
  function viewSettings() {
    let html = '<h1>' + esc(t('settings')) + '</h1>';
    html += '<h2>' + esc(t('practiceTitle')) + '</h2><button class="btn" ' + on('main', function () { openScanner(true); }) + '>' +
      esc(t('practiceScan')) + '<small>' + esc(t('practiceSub')) + '</small></button>';
    html += '<h2>' + esc(t('language')) + '</h2><div class="seg">' +
      ['ja', 'en'].map(function (l) {
        return '<button class="' + (lang === l ? 'on' : '') + '" ' + on('main', function () {
          lang = l; try { localStorage.setItem(KEY_LANG, l); } catch (e) { /* ignore */ }
          document.documentElement.lang = l; render();
        }) + '>' + (l === 'ja' ? '日本語' : 'English') + '</button>';
      }).join('') + '</div>';

    html += '<h2>' + esc(t('backup')) + '</h2><div class="card">' + backupNotice() +
      '<button class="btn primary" ' + on('main', saveBackup) + '>' + esc(t('saveBackup')) + '<small>' + esc(t('saveBackupSub')) + '</small></button>' +
      '<button class="btn" ' + on('main', restorePick) + '>' + esc(t('restore')) + '</button>' +
      '<button class="btn ghost" ' + on('main', exportCSV) + '>' + esc(t('exportCSV')) + '</button></div>';

    const cfg = db.config;
    html += '<h2>' + esc(t('rules')) + '</h2><div class="card">' +
      [['singlePrice', cfg.singlePrice], ['bundlePrice', cfg.bundlePrice], ['ticketsTotal', cfg.ticketsTotal], ['maxOpportunities', cfg.maxOpportunities]]
        .map(function (p) { return '<label for="cfg-' + p[0] + '">' + esc(t(p[0])) + '</label><input id="cfg-' + p[0] + '" data-cfg="' + p[0] + '" type="number" inputmode="numeric" min="1" value="' + esc(p[1]) + '">'; }).join('') +
      '<p class="small muted">' + esc(t('rulesNote')) + '</p></div>';

    html += '<p class="small muted center" style="margin-top:24px">' + esc(isStandalone() ? t('storageSafe') : t('storageUnsafe')) +
      '<br>' + esc(t('version', { v: APP_VERSION })) + '</p>';

    setTimeout(function () {
      document.querySelectorAll('[data-cfg]').forEach(function (inp) {
        inp.onchange = function () {
          const v = Number(inp.value);
          if (v > 0) { db.config[inp.dataset.cfg] = v; save(); }
        };
      });
    });
    return html;
  }

  // ---------- Scanner ----------
  let stream = null, scanning = false, cardOpen = false, lastCode = '', lastAt = 0, loopTimer = null, practice = false;

  function openScanner(practiceMode) {
    practice = !!practiceMode;
    $('toast').hidden = true;
    $('scanner').hidden = false;
    $('scanner').classList.toggle('practice', practice);
    $('scanHint').textContent = practice ? t('practiceHint') : t('pointCamera');
    hideCard();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showCameraError(); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
      .then(function (s) {
        stream = s;
        const v = $('video'); v.srcObject = s;
        return v.play();
      })
      .then(function () { scanning = true; tick(); })
      .catch(function (e) { console.error(e); showCameraError(); });
  }

  function showCameraError() {
    showCard(() => '<p class="status">' + esc(t('cameraError')) + '</p><button class="btn primary" ' + on('card', closeScanner) + '>' + esc(t('close')) + '</button>');
  }

  function closeScanner() {
    scanning = false; practice = false; clearTimeout(loopTimer);
    if (stream) stream.getTracks().forEach(function (tr) { tr.stop(); });
    stream = null;
    $('scanner').hidden = true; hideCard();
    render();
  }
  $('scanClose').onclick = closeScanner;

  function tick() {
    if (!scanning) return;
    loopTimer = setTimeout(tick, 140);
    if (cardOpen) return;
    const v = $('video');
    if (!v.videoWidth) return;
    const cv = $('canvas'), scale = Math.min(1, 640 / v.videoWidth);
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    const res = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    if (!res || !res.data) return;
    const code = res.data.trim();
    if (code === lastCode && Date.now() - lastAt < 3000) return;
    lastCode = code; lastAt = Date.now();
    onScan(code);
  }

  function onScan(code) {
    const c = BM.customer(db, code);
    if (!c) {
      showCard(() => '<div class="success"><div class="big-check info">?</div><h3>' + esc(t('unknownCard')) + '</h3>' +
        '<button class="btn primary" ' + on('card', hideCard) + '>' + esc(t('close')) + '</button></div>');
      return;
    }
    const today = BM.today();
    showCard(() => actionSheet('card', c.id, today, {
      manual: false,
      close: hideCard,
      done: function (msg, undo, cid) {
        const st = BM.status(db, cid, today);
        showCard(() => '<div class="success"><div class="big-check">✓</div><h3>' + esc(msg) + '</h3>' +
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
  }
  function hideCard() {
    clearTimeout(successTimer);
    $('scanCard').hidden = true; cardOpen = false; lastAt = Date.now();
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

  // ---------- boot ----------
  document.documentElement.lang = lang;
  render();
  askMissedClasses();
  // iPhone home-screen apps resume instead of reloading, so ask on resume too.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { render(); askMissedClasses(); }
  });

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () {});
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); });
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
  window.__bm = { get db() { return db; }, onScan: onScan, openScanner: openScanner, go: go };
})();
