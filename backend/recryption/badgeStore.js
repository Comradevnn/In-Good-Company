// Recryption integration, module 3 of 3: BadgeService.
//
// Replaces the raw-PEM signing path: badges are issued, verified, and
// revoked by the library, signed through the Signer callback from
// keyStore.js (the one remaining PEM touchpoint), under the key already
// registered with KeyManager in module 1. The old hand-built
// {payload, signature} badge format is gone — users.verification_badge now
// mirrors the library's SignedBadge {payload, sig} for display, and the
// badges/signed_badges tables are the authoritative lifecycle state.
//
// D7 — badge subject_id is users.id, not account_id. The badge attests
// claims that live on the profile row (full_name, age); document_hashes
// already keys duplicate claims by users.id (module 2); and the matching
// engine's user_id is users.id. account_id identifies a login credential,
// not a person's verified identity — the demo seeder was the one path
// signing account_id, and it now goes through this module like live code.
//
// D8 — claims digest covers source VALUES only: sourceFields is
// ['age', 'full_name'] resolved straight from the users row. The derived
// booleans in this app (users.verified, the attest request's
// name_match/dob_match/doc_type_confirmed) never feed the digest —
// "name_verified: true" doesn't change when the name itself does, which is
// the exact failure the library's design warns about. users.verified stays
// as a denormalized DISPLAY flag only, synced from badge lifecycle events.
const { SqliteKeyStore, makeSigner, loadRecryption, registerExistingBadgeKey } = require('./keyStore');

// Spec §3.1 registered source fields (alphabetical, matching canonical-JSON
// key order so a hand-computed digest is easy to reproduce in tests).
const SOURCE_FIELDS = ['age', 'full_name'];

function rowToBadgeRecord(row) {
  if (!row) return undefined;
  const record = {
    badge_id: row.badge_id,
    subject_id: row.subject_id,
    key_id: row.key_id,
    claims_digest: row.claims_digest,
    status: row.status,
    revoked_reason: row.revoked_reason ?? null,
    issued_at: row.issued_at,
  };
  if (row.revoked_at != null) record.revoked_at = row.revoked_at;
  return record;
}

// Recryption BadgeStore over better-sqlite3 (async wrappers over sync calls,
// same pattern as the key and hash stores).
class SqliteBadgeStore {
  constructor(db) {
    this.db = db;
  }

  async get(badgeId) {
    return rowToBadgeRecord(this.db.prepare('SELECT * FROM badges WHERE badge_id = ?').get(badgeId));
  }

  async save(record) {
    this.db.prepare(`
      INSERT INTO badges (badge_id, subject_id, key_id, claims_digest, status, revoked_reason, issued_at, revoked_at)
      VALUES (@badge_id, @subject_id, @key_id, @claims_digest, @status, @revoked_reason, @issued_at, @revoked_at)
      ON CONFLICT(badge_id) DO UPDATE SET
        subject_id = excluded.subject_id,
        key_id = excluded.key_id,
        claims_digest = excluded.claims_digest,
        status = excluded.status,
        revoked_reason = excluded.revoked_reason,
        issued_at = excluded.issued_at,
        revoked_at = excluded.revoked_at
    `).run({
      badge_id: record.badge_id,
      subject_id: record.subject_id,
      key_id: record.key_id,
      claims_digest: record.claims_digest,
      status: record.status,
      revoked_reason: record.revoked_reason ?? null,
      issued_at: record.issued_at,
      revoked_at: record.revoked_at ?? null,
    });
  }

  async saveSigned(badge) {
    this.db.prepare(`
      INSERT INTO signed_badges (badge_id, badge_json) VALUES (?, ?)
      ON CONFLICT(badge_id) DO UPDATE SET badge_json = excluded.badge_json
    `).run(badge.payload.badge_id, JSON.stringify(badge));
  }

  async getSigned(badgeId) {
    const row = this.db.prepare('SELECT badge_json FROM signed_badges WHERE badge_id = ?').get(badgeId);
    return row ? JSON.parse(row.badge_json) : undefined;
  }

  async listValidBySubject(subjectId) {
    return this.db.prepare("SELECT * FROM badges WHERE subject_id = ? AND status = 'valid'")
      .all(subjectId).map(rowToBadgeRecord);
  }

  async listValidByKey(keyId) {
    return this.db.prepare("SELECT * FROM badges WHERE key_id = ? AND status = 'valid'")
      .all(keyId).map(rowToBadgeRecord);
  }

  // App-side: used by clear-demo-users.js. Returns deleted counts.
  deleteBySubjectIds(subjectIds) {
    if (subjectIds.length === 0) return { badges: 0, signed: 0 };
    const placeholders = subjectIds.map(() => '?').join(',');
    const signed = this.db.prepare(`
      DELETE FROM signed_badges WHERE badge_id IN (SELECT badge_id FROM badges WHERE subject_id IN (${placeholders}))
    `).run(...subjectIds).changes;
    const badges = this.db.prepare(`DELETE FROM badges WHERE subject_id IN (${placeholders})`).run(...subjectIds).changes;
    return { badges, signed };
  }
}

// Wires BadgeService to this app: KeyManager over signing_keys (module 1,
// ensuring the PEM's key is registered — idempotent, and a no-op on the dev
// db where module 1 already registered d2dd14a4ff33f236040605e3760a0a91),
// source fields resolved live from the users row, and the PEM-backed Signer.
async function makeBadgeService(db) {
  const { BadgeService, KeyManager } = await loadRecryption();
  await registerExistingBadgeKey(db);

  const keyManager = new KeyManager(new SqliteKeyStore(db));
  const badgeStore = new SqliteBadgeStore(db);
  const badgeService = new BadgeService(badgeStore, keyManager, {
    sourceFields: SOURCE_FIELDS,
    resolveSourceFields: async (subjectId) => {
      const row = db.prepare('SELECT full_name, age FROM users WHERE id = ?').get(subjectId);
      // Missing row → {} → BadgeService treats missing fields as a claims
      // change and fails closed, which is the right read for a deleted user.
      return row ? { full_name: row.full_name, age: row.age } : {};
    },
  });
  return { badgeService, badgeStore, keyManager, signer: makeSigner() };
}

// The display claims signed into every badge this app issues. Deliberately
// tiny: display_name for the pairing-reveal surface, and the "preview"
// labeling INSIDE the signed bytes (a tampered upgrade to "full" breaks the
// signature) — carried over from the old badge format's status field.
function badgeClaims(user) {
  return { display_name: user.display_name, verification_level: 'preview' };
}

// D9 — re-attesting without a claim change used to leave two valid badges
// for the same subject: BadgeService.issue() (badge.ts) is purely additive,
// with no notion of "one badge per subject" built into the library, and the
// lazy/eager revocation paths (verify()'s step 6, onClaimsChanged) only ever
// fire on a claims_digest MISMATCH — an unchanged re-attest never trips
// them, so the old badge just sits there valid forever alongside the new
// one. Decision: this app enforces exactly one valid badge per subject, so
// every issuance goes through issueSuperseding instead of calling
// badgeService.issue() directly. New badge first, then revoke whatever else
// was valid for that subject — issuing first means a signer failure (e.g.
// no active key) leaves the old badge untouched instead of revoking it and
// then failing to replace it. Revocation reason is "manual": the library's
// RevokedReason type (badge.ts) is a closed enum of exactly claim_change /
// manual / key_compromise with no "superseded" case, and extending the
// library was out of scope for this app-only fix — "manual" is the nearest
// fit of the three (it's neither a claims mismatch nor a key rotation).
async function issueSuperseding(badgeService, badgeStore, params, signer) {
  const previouslyValid = await badgeStore.listValidBySubject(params.subject_id);
  const signedBadge = await badgeService.issue(params, signer);
  for (const record of previouslyValid) {
    await badgeService.revokeBadge(record.badge_id);
  }
  return signedBadge;
}

// One-time, idempotent upgrade of pre-module-3 verified users: rows with
// verified=1 but no valid badge record still hold the old hand-signed
// {payload, signature} format, which nothing can verify or revoke through
// the library. Reissues each as a real BadgeService badge (claims digest
// from their CURRENT full_name/age) and mirrors it onto
// users.verification_badge. Runs at startup, skips anyone already upgraded.
async function upgradeLegacyBadges(db, badgeService, signer) {
  const legacy = db.prepare(`
    SELECT u.id, u.display_name FROM users u
    WHERE u.verified = 1
      AND NOT EXISTS (SELECT 1 FROM badges b WHERE b.subject_id = u.id AND b.status = 'valid')
  `).all();
  for (const user of legacy) {
    const signed = await badgeService.issue({ subject_id: user.id, claims: badgeClaims(user) }, signer);
    db.prepare('UPDATE users SET verification_badge = ? WHERE id = ?').run(JSON.stringify(signed), user.id);
  }
  return legacy.length;
}

module.exports = { SqliteBadgeStore, makeBadgeService, badgeClaims, issueSuperseding, upgradeLegacyBadges, SOURCE_FIELDS };
