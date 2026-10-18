// Standalone script — deletes ONLY the demo accounts created by
// seed-demo-users.js: rows whose account email matches /^demo-\d+@example\.com$/,
// nothing else, ever. Run with `node clear-demo-users.js`.
//
// Deliberately narrow-matched (not a LIKE 'demo%' or similar) so this can
// never touch a real account or unrelated test data, even by accident.

const db = require('./db');
const { SqliteDocumentHashStore } = require('./recryption/hashStore');
const { SqliteBadgeStore } = require('./recryption/badgeStore');

const DEMO_EMAIL_RE = /^demo-\d+@example\.com$/;

function clearLifecycleRows(userIds, ph) {
  const counts = {};
  const run = (label, sql, params) => {
    counts[label] = db.prepare(sql).run(...params).changes;
  };
  const pairingIds = db.prepare(`SELECT id FROM pairings WHERE user_a_id IN (${ph}) OR user_b_id IN (${ph})`)
    .all(...userIds, ...userIds).map((p) => p.id);
  // Give back the shift capacity their live bookings were holding.
  for (const b of db.prepare(`SELECT shift_id FROM bookings WHERE user_id IN (${ph}) AND status IN ('proposed', 'confirmed')`).all(...userIds)) {
    db.prepare('UPDATE shifts SET capacity_booked = MAX(capacity_booked - 1, 0) WHERE id = ?').run(b.shift_id);
  }
  if (pairingIds.length) {
    const pp = pairingIds.map(() => '?').join(',');
    run('messages', `DELETE FROM messages WHERE pairing_id IN (${pp})`, pairingIds);
    run('partner_ratings', `DELETE FROM partner_ratings WHERE pairing_id IN (${pp})`, pairingIds);
  }
  const holdIds = db.prepare(`SELECT id FROM deeds_holds WHERE user_id IN (${ph})`).all(...userIds).map((h) => h.id);
  if (holdIds.length) {
    const hp = holdIds.map(() => '?').join(',');
    run('forfeiture_revenue', `DELETE FROM forfeiture_revenue WHERE hold_id IN (${hp})`, holdIds);
  }
  run('deeds_holds', `DELETE FROM deeds_holds WHERE user_id IN (${ph})`, userIds);
  run('deeds_ledger', `DELETE FROM deeds_ledger WHERE user_id IN (${ph})`, userIds);
  run('org_volunteer_ratings', `DELETE FROM org_volunteer_ratings WHERE user_id IN (${ph})`, userIds);
  run('volunteer_org_ratings', `DELETE FROM volunteer_org_ratings WHERE user_id IN (${ph})`, userIds);
  run('bookings', `DELETE FROM bookings WHERE user_id IN (${ph})`, userIds);
  run('availability_requests', `DELETE FROM availability_requests WHERE user_id IN (${ph})`, userIds);
  run('notifications', `DELETE FROM notifications WHERE user_id IN (${ph})`, userIds);
  run('reliability_events', `DELETE FROM reliability_events WHERE user_id IN (${ph})`, userIds);
  run('premium_subscriptions', `DELETE FROM premium_subscriptions WHERE user_id IN (${ph})`, userIds);
  run('buddies', `DELETE FROM buddies WHERE user_low_id IN (${ph}) OR user_high_id IN (${ph})`, [...userIds, ...userIds]);
  run('safety_reports', `DELETE FROM safety_reports WHERE reporter_user_id IN (${ph})`, userIds);
  return counts;
}

function clear() {
  const accounts = db.prepare('SELECT id, email FROM accounts').all()
    .filter((account) => DEMO_EMAIL_RE.test(account.email));

  if (accounts.length === 0) {
    console.log('No demo-N@example.com accounts found — nothing to clear.');
    return;
  }

  const accountIds = accounts.map((a) => a.id);
  const placeholders = accountIds.map(() => '?').join(',');

  const userIds = db.prepare(`SELECT id FROM users WHERE account_id IN (${placeholders})`)
    .all(...accountIds)
    .map((u) => u.id);

  if (userIds.length > 0) {
    const userPlaceholders = userIds.map(() => '?').join(',');

    // An active pairing between a demo user and a real account would leave
    // the real account's booking pointing at a deleted pairing — refuse
    // rather than touch rows this script didn't create.
    const mixed = db.prepare(`
      SELECT COUNT(*) AS n FROM pairings WHERE status IN ('proposed', 'confirmed')
        AND ((user_a_id IN (${userPlaceholders})) != (user_b_id IN (${userPlaceholders})))
    `).get(...userIds, ...userIds).n;
    if (mixed > 0) {
      console.log(`Not clearing: ${mixed} active pairing(s) link a demo account with a non-demo account. Cancel those in the app first.`);
      process.exitCode = 1;
      return;
    }

    // Lifecycle rows owned by demo users (requests, bookings and their
    // capacity, Deeds ledger/holds, chat, notifications, ratings, buddies,
    // reliability events, safety reports they filed).
    const lifecycleCounts = clearLifecycleRows(userIds, userPlaceholders);
    console.log(`deleted demo users' lifecycle rows: ${JSON.stringify(lifecycleCounts)}`);

    const pairingsDeleted = db.prepare(`
      DELETE FROM pairings WHERE user_a_id IN (${userPlaceholders}) OR user_b_id IN (${userPlaceholders})
    `).run(...userIds, ...userIds);
    console.log(`deleted ${pairingsDeleted.changes} pairing row(s) involving demo users`);

    // Demo users' document claims (document_hashes is subject-keyed by
    // users.id) — without this, orphaned claims would make the next seed's
    // checkDuplicate see DEMO-DOC-N as taken by a deleted user.
    const claimsDeleted = new SqliteDocumentHashStore(db).deleteBySubjectIds(userIds);
    console.log(`deleted ${claimsDeleted} document claim(s) for demo users`);

    // Their badge lifecycle rows too (badges + the signed archive, module 3).
    const badgesDeleted = new SqliteBadgeStore(db).deleteBySubjectIds(userIds);
    console.log(`deleted ${badgesDeleted.badges} badge record(s) and ${badgesDeleted.signed} signed badge(s) for demo users`);
  }

  const usersDeleted = db.prepare(`DELETE FROM users WHERE account_id IN (${placeholders})`).run(...accountIds);
  const accountsDeleted = db.prepare(`DELETE FROM accounts WHERE id IN (${placeholders})`).run(...accountIds);

  console.log(`deleted ${usersDeleted.changes} user row(s), ${accountsDeleted.changes} account row(s):`);
  accounts.forEach((a) => console.log(`  - ${a.email}`));
}

try {
  clear();
} catch (err) {
  console.error('Clearing demo users failed:', err);
  process.exitCode = 1;
}
