const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
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

module.exports = db;
