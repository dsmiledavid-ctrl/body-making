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
    // Only the owner's check-ins count (the AppSheet data had one row linked to
    // another customer's bundle).
    const attended = db.attendance.filter(function (a) { return a.bundleId === b.id && a.customerId === b.customerId; }).length;
    const passedClasses = db.sessions.filter(function (s) {
      return s.date >= b.startDate && s.date < today;
    }).length;
    const attendedToday = db.attendance.some(function (a) {
      return a.bundleId === b.id && a.customerId === b.customerId && a.date === today;
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

  // Sells a bundle starting on `date` (no check-in), e.g. paid in advance.
  BM.sellBundle = function (db, customerId, date) {
    const b = {
      id: BM.newId(), customerId: customerId, startDate: date,
      ticketsTotal: Number(db.config.ticketsTotal) || 10,
      maxOpportunities: Number(db.config.maxOpportunities) || 12,
      price: Number(db.config.bundlePrice) || 0
    };
    db.bundles.push(b);
    return b;
  };

  // Sells a bundle starting on `date` and checks the customer in with it.
  BM.sellBundleAndCheckIn = function (db, customerId, date, opts) {
    if (BM.checkedInOn(db, customerId, date)) throw new Error('already checked in');
    const b = BM.sellBundle(db, customerId, date);
    const a = BM.checkIn(db, customerId, date, opts);
    return { bundle: b, attendance: a };
  };

  BM.updateBundle = function (db, id, fields) {
    const b = db.bundles.find(function (x) { return x.id === id; });
    if (!b) return null;
    if (fields.startDate) b.startDate = fields.startDate;
    if (Number(fields.ticketsTotal) > 0) b.ticketsTotal = Number(fields.ticketsTotal);
    if (Number(fields.maxOpportunities) > 0) b.maxOpportunities = Number(fields.maxOpportunities);
    return b;
  };

  // Everyone with tickets left, soonest-to-run-out first.
  BM.activeBundles = function (db, today) {
    today = today || BM.today();
    return db.bundles.map(function (b) {
      return { bundle: b, stats: BM.bundleStats(db, b, today), customer: BM.customer(db, b.customerId) };
    }).filter(function (x) { return x.customer && x.stats.ticketsLeft > 0; })
      .sort(function (x, y) {
        return Math.min(x.stats.ticketsLeft, x.stats.oppLeft) - Math.min(y.stats.ticketsLeft, y.stats.oppLeft);
      });
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

  // ---- bundles that ended at the most recent class --------------------------------
  // For the People list: who had a usable bundle going into the last class,
  // has none now (last ticket used, or the class-date limit ran out), and has
  // not bought a new one. Clears itself on a new bundle or at the next class.
  BM.lastClassDate = function (db, today) {
    today = today || BM.today();
    const d = db.sessions.map(function (s) { return s.date; }).filter(function (x) { return x <= today; }).sort();
    return d.length ? d[d.length - 1] : null;
  };

  BM.endedAtLastClass = function (db, today) {
    today = today || BM.today();
    const L = BM.lastClassDate(db, today);
    if (!L) return [];
    const out = [];
    db.customers.forEach(function (c) {
      if (BM.activeBundle(db, c.id, today)) return;                 // still has (or bought) a bundle
      BM.customerBundles(db, c.id).forEach(function (b) {
        if (b.startDate > L) return;
        const mine = db.attendance.filter(function (a) { return a.bundleId === b.id && a.customerId === c.id; });
        const attBefore = mine.filter(function (a) { return a.date < L; }).length;
        const oppBefore = db.sessions.filter(function (s) { return s.date >= b.startDate && s.date < L; }).length;
        const leftBefore = Math.min(b.ticketsTotal - attBefore, b.maxOpportunities - oppBefore);
        if (leftBefore <= 0) return;                                  // had already ended before L
        if (BM.bundleStats(db, b, today).ticketsLeft > 0) return;     // still usable (e.g. L is today, not attended yet)
        const cameAtL = mine.some(function (a) { return a.date === L; });
        out.push({ customer: c, bundle: b, date: L, reason: cameAtL ? 'used' : 'expired', unused: Math.max(0, b.ticketsTotal - mine.length) });
      });
    });
    return out;
  };

  // ---- usage report (for the customer) ----------------------------------------
  // Current bundle (or the latest one), the class dates they came to and the
  // ones they missed since it started. Today counts only if they came.
  BM.usageReport = function (db, customerId, today) {
    today = today || BM.today();
    const list = BM.customerBundles(db, customerId);
    const bundle = BM.activeBundle(db, customerId, today) || list[list.length - 1] || null;
    if (!bundle) return null;
    const mine = db.attendance.filter(function (a) { return a.customerId === customerId; });
    const came = mine.filter(function (a) { return a.bundleId === bundle.id; })
      .map(function (a) { return a.date; }).sort();
    const attendedOn = {};
    mine.forEach(function (a) { attendedOn[a.date] = true; });
    const missed = db.sessions.map(function (s) { return s.date; })
      .filter(function (d) { return d >= bundle.startDate && d < today && !attendedOn[d]; }).sort();
    return { bundle: bundle, stats: BM.bundleStats(db, bundle, today), came: came, missed: missed };
  };

  // ---- missed classes ---------------------------------------------------------
  // Class dates are only saved when someone checks in (or "Start class" is
  // pressed). If only single-ticket people came, nothing is saved and bundle
  // windows stop moving. So: when the last saved class (or the last time we
  // asked) is more than 14 days ago, list the usual class weekday's dates
  // since then and ask which ones happened.

  function parseISO(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

  // The weekday most of the recent classes were on (0 = Sunday).
  BM.usualWeekday = function (db) {
    const recent = db.sessions.map(function (s) { return s.date; }).sort().slice(-20);
    if (!recent.length) return null;
    const count = [0, 0, 0, 0, 0, 0, 0];
    recent.forEach(function (d) { count[parseISO(d).getDay()]++; });
    return count.indexOf(Math.max.apply(null, count));
  };

  BM.missingClassDates = function (db, today) {
    today = today || BM.today();
    if (!db.sessions.length) return [];
    const last = db.sessions.map(function (s) { return s.date; }).sort().pop();
    const asked = db.meta.classesAskedThrough || '';
    const anchor = asked > last ? asked : last;
    if (daysBetween(anchor, today) <= 14) return [];
    const wd = BM.usualWeekday(db);
    const out = [];
    const d = parseISO(anchor);
    d.setDate(d.getDate() + 1);
    while (BM.localISO(d) < today) {
      if (d.getDay() === wd && !BM.hasSession(db, BM.localISO(d))) out.push(BM.localISO(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  };

  // Save the ticked dates; never ask about this stretch again.
  BM.answerMissingClasses = function (db, ticked, today) {
    today = today || BM.today();
    ticked.forEach(function (date) { BM.addSession(db, date); });
    const y = parseISO(today); y.setDate(y.getDate() - 1);
    db.meta.classesAskedThrough = BM.localISO(y);
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
