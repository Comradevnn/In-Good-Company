const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

// DB_PATH lets the lifecycle test suites run against a throwaway database
// file instead of the shared dev database; everything else uses the default.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
// Two processes (the dev server and a seed or test script) may write at once;
// wait for the lock instead of failing immediately with SQLITE_BUSY.
db.pragma('busy_timeout = 5000');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

// Migrations for databases created before a column existed — CREATE TABLE IF
// NOT EXISTS won't add new columns to an existing table.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((column) => column.name === 'account_id')) {
  // SQLite's ALTER TABLE can't add a UNIQUE column directly; enforce
  // uniqueness with a separate index instead.
  db.exec('ALTER TABLE users ADD COLUMN account_id TEXT REFERENCES accounts(id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id)');
}
if (!userColumns.some((column) => column.name === 'seeking')) {
  // See schema.sql: intentionally excluded from matching logic, same as tier.
  db.exec(`ALTER TABLE users ADD COLUMN seeking TEXT NOT NULL DEFAULT 'open' CHECK (seeking IN ('friendship_only', 'open'))`);
}
if (!userColumns.some((column) => column.name === 'partner_prefs_confirmed')) {
  db.exec('ALTER TABLE users ADD COLUMN partner_prefs_confirmed INTEGER NOT NULL DEFAULT 0');
}
if (!userColumns.some((column) => column.name === 'verified_at')) {
  db.exec('ALTER TABLE users ADD COLUMN verified_at TEXT');
  db.exec('ALTER TABLE users ADD COLUMN verification_badge TEXT');
}
// Integration module 3: users.doc_hmac retired — document_hashes (module 2)
// owns duplicate-document state and nothing reads the column anymore. Drop
// works on databases where the column arrived via the old ALTER migration
// (separate index); a database created fresh in the module-2 window declared
// it inline-UNIQUE, which SQLite can't drop — warn and leave it unused there.
if (userColumns.some((column) => column.name === 'doc_hmac')) {
  db.exec('DROP INDEX IF EXISTS idx_users_doc_hmac');
  try {
    db.exec('ALTER TABLE users DROP COLUMN doc_hmac');
  } catch (err) {
    console.warn(`could not drop retired users.doc_hmac column (${err.message}) — leaving it unused`);
  }
}
if (!userColumns.some((column) => column.name === 'deeds_balance')) {
  db.exec('ALTER TABLE users ADD COLUMN deeds_balance INTEGER NOT NULL DEFAULT 0');
}

// Columns added for the prototype lifecycle (orgs/shifts, Deeds ledger,
// Premium, pairing state machine, safety). Applied to fresh and existing
// databases alike: each is added only if missing. Plain ADD COLUMN only —
// no UNIQUE/PRIMARY KEY, which SQLite can't add to an existing table.
function ensureColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, ddl] of columns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

ensureColumns('accounts', [
  // 'individual' (volunteer) or 'org' (host organization login)
  ['kind', "TEXT NOT NULL DEFAULT 'individual'"],
  // Referral code entered at signup, linked to the referrer once the
  // profile row exists (lib/referrals.js)
  ['referral_code_used', 'TEXT'],
]);

ensureColumns('users', [
  // Deeds buckets (available balance only; held Deeds live in deeds_holds).
  // deeds_balance stays the total available, for existing readers.
  ['deeds_purchased', 'INTEGER NOT NULL DEFAULT 0'],
  ['deeds_free', 'INTEGER NOT NULL DEFAULT 0'],
  // Premium (mock subscription; the signup trial is derived from
  // accounts.created_at, not stored)
  ['premium_until', 'TEXT'],
  ['premium_plan', 'TEXT'],
  ['premium_grant_next_at', 'TEXT'],
  // Referrals
  ['referral_code', 'TEXT'],
  ['referred_by_user_id', 'TEXT'],
  ['referral_credited_at', 'TEXT'],
  // Trust & safety
  ['safety_notice_ack_at', 'TEXT'],
  ['matching_paused_until', 'TEXT'],
  ['account_review', 'INTEGER NOT NULL DEFAULT 0'],
]);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)');

ensureColumns('pairings', [
  ['booking_a_id', 'TEXT'],
  ['booking_b_id', 'TEXT'],
  ['request_a_id', 'TEXT'],
  ['request_b_id', 'TEXT'],
  ['origin', "TEXT NOT NULL DEFAULT 'match'"], // match | buddy | rematch | solo_rsvp
  ['reasoning', 'TEXT'],
  ['flags', "TEXT NOT NULL DEFAULT '[]'"],
  ['proposed_at', 'TEXT'],
  ['proposal_expires_at', 'TEXT'],
  ['confirmed_at', 'TEXT'],
  ['ended_at', 'TEXT'],
  ['backed_out_by', 'TEXT'],
  ['bail_user_id', 'TEXT'],
  ['bail_deadline', 'TEXT'],
  ['bail_choice', 'TEXT'],
  ['starters_sent', 'INTEGER NOT NULL DEFAULT 0'],
  ['contact_share_a', 'INTEGER NOT NULL DEFAULT 0'],
  ['contact_share_b', 'INTEGER NOT NULL DEFAULT 0'],
]);

// Pairings created by the old demo matcher point at hardcoded demo shift ids
// that have no row in shifts. Retire them so they never read as an active
// pairing under the new lifecycle (rows are kept, only relabeled).
db.prepare(`
  UPDATE pairings SET status = 'legacy_demo'
  WHERE status = 'confirmed' AND booking_a_id IS NULL AND shift_id LIKE 'demo-shift-%'
`).run();

// Balances from before the ledger existed (the old demo purchase route just
// incremented deeds_balance) become an opening 'purchased' ledger entry, so
// the ledger and the bucket columns agree from the first run onward.
const legacyBalances = db.prepare(`
  SELECT id, deeds_balance FROM users
  WHERE deeds_balance > 0 AND deeds_purchased + deeds_free = 0
    AND NOT EXISTS (SELECT 1 FROM deeds_ledger l WHERE l.user_id = users.id)
`).all();
for (const row of legacyBalances) {
  db.prepare(`
    INSERT INTO deeds_ledger (user_id, entry_type, bucket, available_delta, created_at)
    VALUES (?, 'opening_balance', 'purchased', ?, ?)
  `).run(row.id, row.deeds_balance, new Date().toISOString());
  db.prepare('UPDATE users SET deeds_purchased = deeds_balance WHERE id = ?').run(row.id);
}

module.exports = db;
