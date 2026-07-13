// Standalone test for Recryption integration module 1 (KeyManager) — run
// with `node test-recryption-keymanager.js` from backend/.
//
// Two parts:
//   1. Full lifecycle assertions against a throwaway in-memory SQLite db
//      (fresh register, active status, clean health(), lookup by the
//      key_id Recryption assigned, idempotent re-register, unknown-key
//      lookup) — repeatable, touches nothing shared.
//   2. The actual bootstrap: registers the existing badge key into the
//      real dev db (idempotent), so the key exists under Recryption's
//      model in parallel with its current PEM-based usage.
require('./env');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const {
  SqliteKeyStore,
  badgePublicKeyHex,
  loadRecryption,
  registerExistingBadgeKey,
} = require('./recryption/keyStore');

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

(async () => {
  const { KeyManager, deriveKeyId } = await loadRecryption();
  const publicKeyHex = badgePublicKeyHex();
  const expectedKeyId = deriveKeyId(publicKeyHex);

  console.log('— Part 1: lifecycle against a throwaway in-memory db —');
  const mem = new Database(':memory:');
  mem.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  const store = new SqliteKeyStore(mem);
  const manager = new KeyManager(store);

  const first = await registerExistingBadgeKey(mem);
  check('existing PEM key registers successfully', Boolean(first.key), 'no key returned');
  check('fresh registration is not flagged as already-registered', first.alreadyRegistered === false);
  check('status reads as active', first.key.status === 'active', `got ${first.key.status}`);
  check(
    'key_id matches deriveKeyId(public key) — self-verifying id',
    first.key.key_id === expectedKeyId,
    `got ${first.key.key_id}, expected ${expectedKeyId}`
  );
  check('public_key round-trips the PEM-derived hex', first.key.public_key === publicKeyHex);

  const active = await manager.getActiveKey();
  check('getActiveKey() returns the registered key', active?.key_id === expectedKeyId);

  const warnings = await manager.health();
  check(
    'health() reports no warnings for a freshly-registered key',
    warnings.length === 0,
    JSON.stringify(warnings)
  );

  const lookup = await manager.lookupForVerification(expectedKeyId);
  check('lookupForVerification(key_id) succeeds', lookup.ok === true, JSON.stringify(lookup));
  check(
    'lookup returns the right record',
    lookup.ok && lookup.key.public_key === publicKeyHex && lookup.key.status === 'active'
  );

  const second = await registerExistingBadgeKey(mem);
  check('re-registration is idempotent (single rotate() total)', second.alreadyRegistered === true);
  check('re-registration returns the same record', second.key.key_id === expectedKeyId);

  const bogus = await manager.lookupForVerification('0'.repeat(32));
  check(
    'unknown key_id fails lookup with unknown_key',
    bogus.ok === false && bogus.reason === 'unknown_key',
    JSON.stringify(bogus)
  );

  console.log('\n— Part 2: register into the real dev db (idempotent bootstrap) —');
  const db = require('./db');
  const real = await registerExistingBadgeKey(db);
  console.log(
    real.alreadyRegistered
      ? `already registered (no new rotate): ${real.key.key_id}`
      : `registered now via rotate(): ${real.key.key_id}`
  );
  console.log(`  status: ${real.key.status}, created_at: ${real.key.created_at}`);
  const realWarnings = await new KeyManager(new SqliteKeyStore(db)).health();
  console.log(`  health(): ${realWarnings.length === 0 ? 'no warnings' : JSON.stringify(realWarnings)}`);
  check('real-db record is active', real.key.status === 'active');
  check('real-db key_id matches the PEM-derived id', real.key.key_id === expectedKeyId);
  check('real-db health() is clean', realWarnings.length === 0, JSON.stringify(realWarnings));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
