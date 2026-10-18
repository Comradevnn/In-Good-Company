// Standalone script — deletes ONLY the demo orgs created by seed-demo-orgs.js:
// org accounts whose email matches /^demo-org-\d+@example\.com$/, their org
// rows, their shifts, and the uploaded waiver files for those orgs. Run with
// `node clear-demo-orgs.js` from backend/.
//
// It refuses to run if anyone other than a demo volunteer (demo-N@example.com)
// has a booking on a demo shift — those rows weren't created by the seed
// scripts, so they aren't this script's to delete. Clear the demo
// volunteers first (clear-demo-users.js), and handle any real bookings by
// hand.
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

const DEMO_ORG_EMAIL_RE = /^demo-org-\d+@example\.com$/;
const DEMO_USER_EMAIL_RE = /^demo-\d+@example\.com$/;

function clear() {
  const accounts = db.prepare("SELECT id, email FROM accounts WHERE kind = 'org'").all()
    .filter((a) => DEMO_ORG_EMAIL_RE.test(a.email));
  if (accounts.length === 0) {
    console.log('No demo-org-N@example.com accounts found — nothing to clear.');
    return;
  }
  const accountIds = accounts.map((a) => a.id);
  const ph = (list) => list.map(() => '?').join(',');
  const orgs = db.prepare(`SELECT id, name, waiver_path FROM orgs WHERE account_id IN (${ph(accountIds)})`).all(...accountIds);
  const orgIds = orgs.map((o) => o.id);
  const shiftIds = orgIds.length
    ? db.prepare(`SELECT id FROM shifts WHERE org_id IN (${ph(orgIds)})`).all(...orgIds).map((s) => s.id) : [];

  if (shiftIds.length) {
    const outsiders = db.prepare(`
      SELECT a.email, COUNT(*) AS n FROM bookings b JOIN users u ON u.id = b.user_id JOIN accounts a ON a.id = u.account_id
      WHERE b.shift_id IN (${ph(shiftIds)}) GROUP BY a.email
    `).all(...shiftIds).filter((row) => !DEMO_USER_EMAIL_RE.test(row.email));
    if (outsiders.length) {
      console.log('Not clearing: these non-demo accounts have bookings on demo shifts:');
      outsiders.forEach((row) => console.log(`  - ${row.email} (${row.n} booking(s))`));
      console.log('Those rows were not created by the seed scripts, so this script will not delete them.');
      process.exitCode = 1;
      return;
    }
    const demoBookings = db.prepare(`SELECT COUNT(*) AS n FROM bookings WHERE shift_id IN (${ph(shiftIds)})`).get(...shiftIds).n;
    if (demoBookings) {
      console.log(`Not clearing: ${demoBookings} demo-volunteer booking(s) still reference demo shifts. Run clear-demo-users.js first.`);
      process.exitCode = 1;
      return;
    }
  }

  db.transaction(() => {
    if (shiftIds.length) {
      const n = db.prepare(`DELETE FROM shifts WHERE id IN (${ph(shiftIds)})`).run(...shiftIds).changes;
      console.log(`deleted ${n} shift row(s)`);
    }
    if (orgIds.length) {
      db.prepare(`DELETE FROM forfeiture_revenue WHERE org_id IN (${ph(orgIds)})`).run(...orgIds);
      const n = db.prepare(`DELETE FROM orgs WHERE id IN (${ph(orgIds)})`).run(...orgIds).changes;
      console.log(`deleted ${n} org row(s)`);
    }
    db.prepare(`DELETE FROM accounts WHERE id IN (${ph(accountIds)})`).run(...accountIds);
  })();
  for (const org of orgs) {
    if (org.waiver_path) fs.rmSync(path.join(path.dirname(db.name), org.waiver_path), { force: true });
  }
  console.log(`deleted ${accounts.length} org account(s):`);
  accounts.forEach((a) => console.log(`  - ${a.email}`));
}

try {
  clear();
} catch (err) {
  console.error('Clearing demo orgs failed:', err);
  process.exitCode = 1;
}
