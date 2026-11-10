// Body Making check-in — the class rules and the data model.
// Pure functions over a plain "db" object, so the same file runs in the
// browser and in the Node tests (tests/logic.test.js).
//
// The bundle rule (kept from the AppSheet app):
//   a bundle is N tickets (default 10) that must be used within M class
//   dates (default 12). Every class date that passes counts against M,
//   whether the customer came or not. Tickets left = whichever runs out first.
(function (root) {
  'use strict';

  const BM = {};

  function pad(n) { return String(n).padStart(2, '0'); }

  // Local calendar date as YYYY-MM-DD (the phone's own time zone).
  BM.localISO = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  BM.today = function () { return BM.localISO(new Date()); };

  // 8 hex characters, same shape as the AppSheet IDs (old QR cards keep working).
  BM.newId = function () {
    let s = '';
    if (root.crypto && root.crypto.getRandomValues) {
      const a = new Uint8Array(4);
      root.crypto.getRandomValues(a);
      a.forEach(function (b) { s += pad(b.toString(16)); });
    } else {
      for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 16).toString(16);
    }
    return s;
  };

  BM.SCHEMA_VERSION = 1;

  BM.emptyDB = function () {
    return {
      schema: BM.SCHEMA_VERSION,
      customers: [],   // {id, name, contact, createdAt}
      bundles: [],     // {id, customerId, startDate, ticketsTotal, maxOpportunities, price}
      sessions: [],    // {date, notes}            one class per date
      attendance: [],  // {id, date, customerId, type:'Bundle'|'Single', bundleId, ts, manual, price}
      config: { singlePrice: 3500, bundlePrice: 30000, ticketsTotal: 10, maxOpportunities: 12 },
      meta: { lastBackup: null, createdAt: new Date().toISOString() }
    };
  };

  // Accepts anything that looks like a db (e.g. from a backup file) and fills gaps.
  BM.normalize = function (raw) {
    const db = BM.emptyDB();
    if (!raw || typeof raw !== 'object') throw new Error('not a backup');
    ['customers', 'bundles', 'sessions', 'attendance'].forEach(function (k) {
      if (raw[k] !== undefined && !Array.isArray(raw[k])) throw new Error('bad ' + k);
      db[k] = (raw[k] || []).slice();
    });
    Object.assign(db.config, raw.config || {});
    Object.assign(db.meta, raw.meta || {});
    return db;
  };

  // ---- lookups -------------------------------------------------------------

  BM.customer = function (db, id) {
    return db.customers.find(function (c) { return c.id === id; }) || null;
  };

  BM.hasSession = function (db, date) {
    return db.sessions.some(function (s) { return s.date === date; });
  };

  BM.bundleStats = function (db, b, today) {
    today = today || BM.today();
    const attended = db.attendance.filter(function (a) { return a.bundleId === b.id; }).length;
    const passedClasses = db.sessions.filter(function (s) {
      return s.date >= b.startDate && s.date < today;
    }).length;
    const attendedToday = db.attendance.some(function (a) {
      return a.bundleId === b.id && a.date === today;
    });
    const oppUsed = passedClasses + (attendedToday ? 1 : 0);
    const ticketsLeft = Math.min(b.ticketsTotal - attended, b.maxOpportunities - oppUsed);
    return {
      attended: attended,
      oppUsed: oppUsed,
      oppLeft: b.maxOpportunities - oppUsed,
      ticketsLeft: Math.max(0, ticketsLeft)
    };
  };

  BM.customerBundles = function (db, customerId) {
    return db.bundles
      .filter(function (b) { return b.customerId === customerId; })
      .sort(function (x, y) { return x.startDate < y.startDate ? -1 : x.startDate > y.startDate ? 1 : 0; });
  };

  // The oldest bundle that still has tickets — the one a check-in uses.
  BM.activeBundle = function (db, customerId, today) {
    const list = BM.customerBundles(db, customerId);
    for (let i = 0; i < list.length; i++) {
      if (BM.bundleStats(db, list[i], today).ticketsLeft > 0) return list[i];
    }
    return null;
  };

  BM.checkedInOn = function (db, customerId, date) {
    return db.attendance.find(function (a) {
      return a.customerId === customerId && a.date === date;
    }) || null;
  };

  // Everything a screen needs to decide which button to show.
  //   state: 'checkedIn' | 'bundle' | 'none'
  BM.status = function (db, customerId, date) {
    const today = BM.today();
    const done = BM.checkedInOn(db, customerId, date);
    const bundle = BM.activeBundle(db, customerId, today);
    const stats = bundle ? BM.bundleStats(db, bundle, today) : null;
    return {
      state: done ? 'checkedIn' : bundle ? 'bundle' : 'none',
      attendance: done,
      bundle: bundle,
      stats: stats
    };
  };

  // ---- changes (each returns what it created, for undo) ---------------------

  BM.addSession = function (db, date) {
    if (BM.hasSession(db, date)) return null;
    const s = { date: date, notes: '' };
    db.sessions.push(s);
    return s;
  };

  BM.addCustomer = function (db, name, contact) {
    let id = BM.newId();
    while (BM.customer(db, id)) id = BM.newId();
    const c = { id: id, name: String(name).trim(), contact: String(contact || '').trim(), createdAt: new Date().toISOString() };
    db.customers.push(c);
    return c;
  };

  BM.checkIn = function (db, customerId, date, opts) {
    opts = opts || {};
    if (BM.checkedInOn(db, customerId, date)) throw new Error('already checked in');
    const bundle = BM.activeBundle(db, customerId, BM.today());
    if (!bundle) throw new Error('no active bundle');
    const a = {
      id: BM.newId(), date: date, customerId: customerId, type: 'Bundle',
      bundleId: bundle.id, ts: new Date().toISOString(), manual: !!opts.manual, price: 0
    };
    db.attendance.push(a);
    return a;
  };

  BM.sellSingle = function (db, customerId, date, opts) {
    opts = opts || {};
    if (BM.checkedInOn(db, customerId, date)) throw new Error('already checked in');
    const a = {
      id: BM.newId(), date: date, customerId: customerId, type: 'Single',
      bundleId: null, ts: new Date().toISOString(), manual: !!opts.manual,
      price: Number(db.config.singlePrice) || 0
    };
    db.attendance.push(a);
    return a;
  };

  // Sells a bundle starting on `date` and checks the customer in with it.
  BM.sellBundleAndCheckIn = function (db, customerId, date, opts) {
    if (BM.checkedInOn(db, customerId, date)) throw new Error('already checked in');
    const b = {
      id: BM.newId(), customerId: customerId, startDate: date,
      ticketsTotal: Number(db.config.ticketsTotal) || 10,
      maxOpportunities: Number(db.config.maxOpportunities) || 12,
      price: Number(db.config.bundlePrice) || 0
    };
    db.bundles.push(b);
    const a = BM.checkIn(db, customerId, date, opts);
    return { bundle: b, attendance: a };
  };

  BM.removeAttendance = function (db, id) {
    const i = db.attendance.findIndex(function (a) { return a.id === id; });
    if (i >= 0) db.attendance.splice(i, 1);
  };

  BM.removeBundle = function (db, id) {
    db.attendance = db.attendance.filter(function (a) { return a.bundleId !== id; });
    db.bundles = db.bundles.filter(function (b) { return b.id !== id; });
  };

  BM.removeSession = function (db, date) {
    db.sessions = db.sessions.filter(function (s) { return s.date !== date; });
  };

  // ---- export ---------------------------------------------------------------

  function csvCell(v) {
    v = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  BM.attendanceCSV = function (db) {
    const rows = [['date', 'name', 'type', 'bundle_start', 'price_huf', 'added_by_hand']];
    const byBundle = {};
    db.bundles.forEach(function (b) { byBundle[b.id] = b; });
    db.attendance.slice().sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; })
      .forEach(function (a) {
        const c = BM.customer(db, a.customerId);
        const b = a.bundleId ? byBundle[a.bundleId] : null;
        rows.push([a.date, c ? c.name : a.customerId, a.type, b ? b.startDate : '', a.price || '', a.manual ? 'yes' : '']);
      });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
  };

  BM.backupPayload = function (db) {
    return { app: 'body-making', schema: BM.SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: db };
  };

  BM.fromBackup = function (obj) {
    if (obj && obj.app === 'body-making' && obj.data) return BM.normalize(obj.data);
    return BM.normalize(obj);
  };

  if (typeof module === 'object' && module.exports) module.exports = BM;
  else root.BM = BM;
})(typeof window !== 'undefined' ? window : globalThis);
