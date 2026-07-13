// Recryption integration, module 1 of 3: KeyManager (key lifecycle only).
//
// What this does: implements Recryption's pluggable KeyStore interface over
// the shared SQLite db (signing_keys table, see db/schema.sql) and registers
// the backend's existing static Ed25519 key — the PEM at backend/keys/ —
// under the library's key_id/status model via a single rotate() call.
//
// What this deliberately does NOT do yet: nothing here is wired into any
// live route. backend/index.js still loads the PEM and signs badges exactly
// as before; DuplicateDetector and BadgeService (which will consume this
// module's KeyManager) come in later passes. The library never receives the
// private key at any stage — its Signer-callback design means only the
// public key is registered here, which is also why registering "in
// parallel" with the existing signing usage is safe.
//
// Module-format seam, worth knowing for the later passes: Recryption is
// ESM-only ("type": "module") and its exports map defines only the
// "import" condition. CommonJS require() — even with Node >= 22.12's
// require(esm) support — does not match "import"-only exports (it needs a
// "module-sync" or "default" condition), so require('recryption') fails
// with ERR_PACKAGE_PATH_NOT_EXPORTED on this project's Node 24. Dynamic
// import() matches "import" fine, so every consumer of the library in this
// CJS backend must go through async loadRecryption(). If the library ever
// adds a "default" condition to its exports, plain require() would start
// working and this loader collapses to one line.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const BADGE_KEY_PATH = path.join(KEYS_DIR, 'badge-signing-key.pem');

// First-run key creation (moved here from index.js in module 3, when this
// module became the only PEM touchpoint). Generated once, persisted under
// backend/keys/ (gitignored) so issued badges stay verifiable across
// restarts. In production this would live in a KMS; a local PEM file is the
// honest prototype version.
function loadPrivateKey() {
  if (!fs.existsSync(BADGE_KEY_PATH)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(BADGE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  return crypto.createPrivateKey(fs.readFileSync(BADGE_KEY_PATH));
}

let recryptionModule = null;

async function loadRecryption() {
  if (recryptionModule) return recryptionModule;
  recryptionModule = await import('recryption');
  return recryptionModule;
}

// The raw 32-byte Ed25519 public key from the existing PEM, as the 64-char
// lowercase hex Recryption's rotate()/deriveKeyId() expect. node:crypto
// doesn't export raw Ed25519 bytes directly, but the JWK form's `x` is
// exactly those 32 bytes, base64url-encoded.
function badgePublicKeyHex() {
  const publicKey = crypto.createPublicKey(loadPrivateKey());
  const { x } = publicKey.export({ format: 'jwk' });
  return Buffer.from(x, 'base64url').toString('hex');
}

// Recryption Signer callback over the PEM key (integration module 3). This
// factory is the ONLY place badge signing touches the PEM — everywhere else
// hands the opaque callback to BadgeService, which is exactly the library's
// KMS/HSM boundary: the private key never enters the library, and swapping
// the PEM for a real KMS later means changing only this function.
function makeSigner() {
  const privateKey = loadPrivateKey();
  return async (message) => crypto.sign(null, message, privateKey);
}

// SQLite rows use NULL for absent timestamps; Recryption's SigningKey shape
// uses absent-vs-present optional fields (issuedAfterRetirement checks
// `retired_at === undefined`), so nulls must be dropped, not passed through.
function rowToKey(row) {
  if (!row) return undefined;
  const key = {
    key_id: row.key_id,
    public_key: row.public_key,
    status: row.status,
    created_at: row.created_at,
  };
  if (row.retired_at != null) key.retired_at = row.retired_at;
  if (row.revoked_at != null) key.revoked_at = row.revoked_at;
  return key;
}

// Recryption KeyStore over better-sqlite3. Methods are async to satisfy the
// interface; better-sqlite3 is synchronous underneath, which also gives the
// sequenced writes inside rotate() effective atomicity on a single instance.
class SqliteKeyStore {
  constructor(db) {
    this.db = db;
  }

  async get(keyId) {
    return rowToKey(this.db.prepare('SELECT * FROM signing_keys WHERE key_id = ?').get(keyId));
  }

  async getActive() {
    return rowToKey(this.db.prepare("SELECT * FROM signing_keys WHERE status = 'active'").get());
  }

  async list() {
    return this.db.prepare('SELECT * FROM signing_keys').all().map(rowToKey);
  }

  async save(key) {
    this.db.prepare(`
      INSERT INTO signing_keys (key_id, public_key, status, created_at, retired_at, revoked_at)
      VALUES (@key_id, @public_key, @status, @created_at, @retired_at, @revoked_at)
      ON CONFLICT(key_id) DO UPDATE SET
        public_key = excluded.public_key,
        status = excluded.status,
        created_at = excluded.created_at,
        retired_at = excluded.retired_at,
        revoked_at = excluded.revoked_at
    `).run({
      key_id: key.key_id,
      public_key: key.public_key,
      status: key.status,
      created_at: key.created_at,
      retired_at: key.retired_at ?? null,
      revoked_at: key.revoked_at ?? null,
    });
  }
}

// Bootstrap: register the existing badge key under Recryption's model.
// Idempotent — rotate() throws on an already-registered key_id, so re-runs
// (server restarts, repeated script runs) short-circuit to the stored
// record instead. First run hits the clean-bootstrap path: no active key
// exists, so rotate() installs this one without retiring anything.
async function registerExistingBadgeKey(db) {
  const { KeyManager, deriveKeyId } = await loadRecryption();
  const publicKeyHex = badgePublicKeyHex();
  const store = new SqliteKeyStore(db);

  const existing = await store.get(deriveKeyId(publicKeyHex));
  if (existing) {
    return { key: existing, alreadyRegistered: true };
  }
  const key = await new KeyManager(store).rotate(publicKeyHex);
  return { key, alreadyRegistered: false };
}

module.exports = { SqliteKeyStore, badgePublicKeyHex, makeSigner, loadRecryption, registerExistingBadgeKey };
