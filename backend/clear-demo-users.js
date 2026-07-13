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
