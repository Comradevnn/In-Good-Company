// Recryption integration, module 2 of 3: DuplicateDetector.
//
// Unlike module 1 (KeyManager, which runs in parallel with existing code),
// this module REPLACES live logic: docIdentity.js's hand-rolled
// normalize+HMAC is gone, and both verification routes now make their
// duplicate decisions through DuplicateDetector against the
// document_hashes table (see db/schema.sql).
//
// Design note — claim-at-check: the library's checkDuplicate() is
// deliberately one call that both answers the duplicate question and
// records the claim. That moves the write from attest time (the old D6
// flow) to document-check time. Consequences, accepted on purpose:
//   - First claim wins: an abandoned check still claims the document for
//     that subject. The same subject re-checking is a refresh, never a
//     self-conflict — which also structurally removes the "re-verifying
//     with the same document 409s" bug in CLAUDE.md's known-bugs list.
//   - The old commit-time re-check race (another account attesting the
//     same document between your check and your attest) can't produce two
//     claims anymore, because the claim exists from check time.
// What attest still does: consumes the staged, SERVER-computed hash and
// verifies the claim still exists and belongs to this subject before
// committing verified status. The client supplies no hash-like value at
// any point — the property D6 established is preserved.
//
// Pepper (D5: app-supplied, never generated/persisted/logged by the
// library): DOC_PEPPER's UTF-8 bytes are the secret — byte-identical to
// what the previous createHmac('sha256', DOC_PEPPER) usage keyed with,
// which is what made the (since-completed, module 3-removed) one-time
// carry-forward of users.doc_hmac values valid. No `previous` peppers: the
// D6 rotation dropped the leaked dev pepper as compromised rather than
// carrying it forward.
const { loadRecryption } = require('./keyStore');

const DEFAULT_PEPPER_ID = 'doc-pepper-v1';

function rowToRecord(row) {
  if (!row) return undefined;
  return {
    doc_hmac: row.doc_hmac,
    pepper_id: row.pepper_id,
    subject_id: row.subject_id,
    created_at: row.created_at,
  };
}

// Recryption DocumentHashStore over better-sqlite3 (interface methods), plus
// two app-side helpers (findLatestBySubject, deleteBySubjectIds) that the
// routes and demo scripts need but the library contract doesn't define.
class SqliteDocumentHashStore {
  constructor(db) {
    this.db = db;
  }

  async findByHmac(docHmac) {
    return rowToRecord(this.db.prepare('SELECT * FROM document_hashes WHERE doc_hmac = ?').get(docHmac));
  }

  async save(record) {
    this.db.prepare(`
      INSERT INTO document_hashes (doc_hmac, pepper_id, subject_id, created_at)
      VALUES (@doc_hmac, @pepper_id, @subject_id, @created_at)
      ON CONFLICT(doc_hmac) DO UPDATE SET
        pepper_id = excluded.pepper_id,
        subject_id = excluded.subject_id,
        created_at = excluded.created_at
    `).run(record);
  }

  async delete(docHmac) {
    this.db.prepare('DELETE FROM document_hashes WHERE doc_hmac = ?').run(docHmac);
  }

  async deleteByPepperId(pepperId) {
    return this.db.prepare('DELETE FROM document_hashes WHERE pepper_id = ?').run(pepperId).changes;
  }

  async countByPepperId(pepperId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM document_hashes WHERE pepper_id = ?').get(pepperId).n;
  }

  // App-side: the record checkDuplicate just wrote/refreshed for a subject —
  // how the routes get the server-computed hash to stage without the library
  // ever exposing raw HMAC computation.
  async findLatestBySubject(subjectId) {
    return rowToRecord(
      this.db.prepare('SELECT * FROM document_hashes WHERE subject_id = ? ORDER BY created_at DESC LIMIT 1').get(subjectId)
    );
  }

  // App-side: used by clear-demo-users.js so cleared demo users don't leave
  // orphaned claims that would block re-seeding the same demo documents.
  deleteBySubjectIds(subjectIds) {
    if (subjectIds.length === 0) return 0;
    const placeholders = subjectIds.map(() => '?').join(',');
    return this.db.prepare(`DELETE FROM document_hashes WHERE subject_id IN (${placeholders})`).run(...subjectIds).changes;
  }
}

// PepperConfig from the environment. The secret is DOC_PEPPER's UTF-8 bytes
// (see header note on hash compatibility); pepper_id can be overridden with
// DOC_PEPPER_ID once rotation becomes real. No previous peppers by design.
function buildPepperConfig() {
  const pepper = process.env.DOC_PEPPER;
  if (!pepper) {
    throw new Error('DOC_PEPPER is not set. Add DOC_PEPPER=<secret> to backend/.env (or the environment).');
  }
  return {
    current: {
      pepper_id: process.env.DOC_PEPPER_ID || DEFAULT_PEPPER_ID,
      secret: Buffer.from(pepper, 'utf8'),
    },
  };
}

// Constructs the detector (validating the pepper config — throws at startup
// on a weak/misconfigured pepper, which is the desired failure mode).
async function makeDetector(db) {
  const { DuplicateDetector } = await loadRecryption();
  const store = new SqliteDocumentHashStore(db);
  const config = buildPepperConfig();
  return { detector: new DuplicateDetector(store, config), store, pepperId: config.current.pepper_id };
}

module.exports = { SqliteDocumentHashStore, buildPepperConfig, makeDetector };
