// Run: node tests/logic.test.js
const assert = require('assert');
const BM = require('../logic.js');

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

const today = BM.today();
function daysAgo(k) { const d = new Date(); d.setDate(d.getDate() - k); return BM.localISO(d); }

t('new customer has no bundle -> state none', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  assert.strictEqual(BM.status(db, c.id, today).state, 'none');
});

t('sell bundle checks in and uses one ticket', function () {
  const db = BM.emptyDB();
  BM.addSession(db, today);
  const c = BM.addCustomer(db, 'A', '');
  BM.sellBundleAndCheckIn(db, c.id, today);
  const s = BM.status(db, c.id, today);
  assert.strictEqual(s.state, 'checkedIn');
  assert.strictEqual(s.stats.ticketsLeft, 9);
});

t('cannot check in twice on one day', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  BM.sellSingle(db, c.id, today);
  assert.throws(function () { BM.sellSingle(db, c.id, today); });
});

t('missed classes eat opportunities (12-class window)', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  const start = daysAgo(7 * 11);
  BM.addSession(db, start);
  BM.sellBundleAndCheckIn(db, c.id, start);       // attended the first class only
  for (let w = 10; w >= 1; w--) BM.addSession(db, daysAgo(7 * w)); // 10 more classes missed
  const b = BM.activeBundle(db, c.id, today);
  const st = BM.bundleStats(db, b, today);
  assert.strictEqual(st.oppUsed, 11);
  assert.strictEqual(st.ticketsLeft, 1);          // min(10-1, 12-11)
});

t('oldest bundle with tickets is used first', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  db.bundles.push({ id: 'old', customerId: c.id, startDate: daysAgo(30), ticketsTotal: 10, maxOpportunities: 12 });
  db.bundles.push({ id: 'new', customerId: c.id, startDate: daysAgo(1), ticketsTotal: 10, maxOpportunities: 12 });
  assert.strictEqual(BM.activeBundle(db, c.id, today).id, 'old');
});

t('undo (remove attendance) restores the ticket', function () {
  const db = BM.emptyDB();
  BM.addSession(db, today);
  const c = BM.addCustomer(db, 'A', '');
  const r = BM.sellBundleAndCheckIn(db, c.id, daysAgo(0));
  BM.removeAttendance(db, r.attendance.id);
  assert.strictEqual(BM.status(db, c.id, today).stats.ticketsLeft, 10);
});

t('backup round-trip', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'Név "x", 名前', '');
  BM.sellSingle(db, c.id, today);
  const back = BM.fromBackup(JSON.parse(JSON.stringify(BM.backupPayload(db))));
  assert.strictEqual(back.attendance.length, 1);
  assert.ok(BM.attendanceCSV(back).includes('"Név ""x"", 名前"'));
});

t('garbage backup is refused', function () {
  assert.throws(function () { BM.fromBackup({ customers: 'nope' }); });
  assert.throws(function () { BM.fromBackup(null); });
});

t('no reminder when last class is within 2 weeks', function () {
  const db = BM.emptyDB();
  BM.addSession(db, '2026-11-04');
  assert.deepStrictEqual(BM.missingClassDates(db, '2026-11-18'), []);
});

t('reminder lists the usual weekday after 2 weeks', function () {
  const db = BM.emptyDB();
  ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'].forEach(function (d) { BM.addSession(db, d); }); // Wednesdays
  // Thursday 19 Nov: 15 days after 4 Nov -> ask about Wed 11 and Wed 18
  assert.deepStrictEqual(BM.missingClassDates(db, '2026-11-19'), ['2026-11-11', '2026-11-18']);
  // today itself is never asked about (she can just start class)
  assert.deepStrictEqual(BM.missingClassDates(db, '2026-11-25'), ['2026-11-11', '2026-11-18']);
});

t('answering (even with nothing ticked) stops the question for that stretch', function () {
  const db = BM.emptyDB();
  ['2026-10-28', '2026-11-04'].forEach(function (d) { BM.addSession(db, d); });
  BM.answerMissingClasses(db, ['2026-11-11'], '2026-11-19');
  assert.ok(BM.hasSession(db, '2026-11-11'));
  assert.ok(!BM.hasSession(db, '2026-11-18'));
  assert.deepStrictEqual(BM.missingClassDates(db, '2026-11-26'), []);
  // two more silent weeks -> asks again, only about the new days
  assert.deepStrictEqual(BM.missingClassDates(db, '2026-12-04'), ['2026-11-25', '2026-12-02']);
});

t('ticked class dates count against bundle windows', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  BM.addSession(db, '2026-11-04');
  db.bundles.push({ id: 'b', customerId: c.id, startDate: '2026-11-04', ticketsTotal: 10, maxOpportunities: 12 });
  const before = BM.bundleStats(db, db.bundles[0], '2026-11-19').oppUsed;
  BM.answerMissingClasses(db, ['2026-11-11', '2026-11-18'], '2026-11-19');
  assert.strictEqual(BM.bundleStats(db, db.bundles[0], '2026-11-19').oppUsed, before + 2);
});

t('sell bundle without check-in, then edit and extend it', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  const b = BM.sellBundle(db, c.id, today);
  assert.strictEqual(BM.status(db, c.id, today).state, 'bundle');
  assert.strictEqual(db.attendance.length, 0);
  BM.updateBundle(db, b.id, { maxOpportunities: 15, ticketsTotal: 8 });
  assert.strictEqual(db.bundles[0].maxOpportunities, 15);
  assert.strictEqual(BM.bundleStats(db, b, today).ticketsLeft, 8);
});

t('bundles overview: soonest to run out first', function () {
  const db = BM.emptyDB();
  const a = BM.addCustomer(db, 'A', ''), z = BM.addCustomer(db, 'Z', '');
  BM.sellBundle(db, a.id, today);
  const bz = BM.sellBundle(db, z.id, today);
  BM.updateBundle(db, bz.id, { ticketsTotal: 2 });
  assert.deepStrictEqual(BM.activeBundles(db, today).map(function (x) { return x.customer.name; }), ['Z', 'A']);
});

t('usage report: came vs missed in the current bundle', function () {
  const db = BM.emptyDB();
  const c = BM.addCustomer(db, 'A', '');
  ['2026-10-07', '2026-10-14', '2026-10-21'].forEach(function (d) { BM.addSession(db, d); });
  db.bundles.push({ id: 'b', customerId: c.id, startDate: '2026-10-07', ticketsTotal: 10, maxOpportunities: 12 });
  db.attendance.push({ id: 'x', date: '2026-10-07', customerId: c.id, type: 'Bundle', bundleId: 'b' });
  db.attendance.push({ id: 'y', date: '2026-10-21', customerId: c.id, type: 'Bundle', bundleId: 'b' });
  BM.addSession(db, '2026-10-28'); // today, not checked in yet -> not "missed"
  const r = BM.usageReport(db, c.id, '2026-10-28');
  assert.deepStrictEqual(r.came, ['2026-10-07', '2026-10-21']);
  assert.deepStrictEqual(r.missed, ['2026-10-14']);
  assert.strictEqual(r.stats.ticketsLeft, 8);
});

t("a check-in linked to someone else's bundle does not use its tickets", function () {
  const db = BM.emptyDB();
  const a = BM.addCustomer(db, 'A', ''), b = BM.addCustomer(db, 'B', '');
  db.bundles.push({ id: 'ba', customerId: a.id, startDate: '2026-10-01', ticketsTotal: 10, maxOpportunities: 12 });
  db.attendance.push({ id: 'x', date: '2026-10-07', customerId: b.id, type: 'Bundle', bundleId: 'ba' });
  assert.strictEqual(BM.bundleStats(db, db.bundles[0], '2026-10-08').attended, 0);
});

console.log(n + ' tests passed');
