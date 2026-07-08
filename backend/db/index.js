const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

module.exports = db;
