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

console.log(n + ' tests passed');
