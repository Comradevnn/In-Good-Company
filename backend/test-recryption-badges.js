// Standalone test for Recryption integration module 3 (BadgeService) —
// run with `node test-recryption-badges.js` from backend/. Starts its own
// server on port 3050 for the HTTP half (per CLAUDE.md, never 3000).
//
// Part 1 (in-memory db): issuance + verification mechanics, the
// values-only claims digest (D8), lazy + eager revocation-on-claim-change,
// the legacy-badge upgrade, and reissueAll under a simulated key
// compromise.
// Part 2 (HTTP, real dev db, self-cleanup): the full live flow — signup →
// document-check → attest issues a real BadgeService badge → profile
// reflects verified → editing a claim field revokes → re-verification
// issues a fresh badge. Plus the users.doc_hmac column drop.
require('./env');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { loadRecryption, badgePublicKeyHex } = require('./recryption/keyStore');
const { SqliteBadgeStore, makeBadgeService, badgeClaims, issueSuperseding, upgradeLegacyBadges } = require('./recryption/badgeStore');
const { SqliteDocumentHashStore } = require('./recryption/hashStore');

const BASE = 'http://localhost:3050';
const REGISTERED_KEY_ID = 'd2dd14a4ff33f236040605e3760a0a91'; // module 1's registration

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

function freshMemDb() {
  const mem = new Database(':memory:');
  mem.exec(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  return mem;
}

function insertUser(db, id, fullName, age) {
  db.prepare(`INSERT INTO accounts (id, email, password_hash) VALUES (?, ?, 'x')`)
    .run(`acct-${id}`, `${id}@example.com`);
  db.prepare(`
    INSERT INTO users (id, account_id, full_name, display_name, age, gender, verified)
    VALUES (?, ?, ?, ?, ?, 'Female', 1)
  `).run(id, `acct-${id}`, fullName, fullName, age);
  return db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(id);
}

async function part1() {
  console.log('— Part 1: BadgeService mechanics against an in-memory db —');
  const { canonicalJson, deriveKeyId } = await loadRecryption();
  const mem = freshMemDb();
  const { badgeService, badgeStore, keyManager, signer } = await makeBadgeService(mem);

  // Issuance + digest (D8: source VALUES only).
  const user1 = insertUser(mem, 'user-1', 'Jordan', 26);
  const badge1 = await badgeService.issue({ subject_id: user1.id, claims: badgeClaims(user1) }, signer);
  check('issued badge subject_id is users.id (D7)', badge1.payload.subject_id === 'user-1');
  check('issued under the module-1-registered key', badge1.payload.key_id === REGISTERED_KEY_ID, badge1.payload.key_id);
  check('registered key_id derives from the PEM public key', deriveKeyId(badgePublicKeyHex()) === REGISTERED_KEY_ID);
  check('"preview" labeling lives inside the signed claims', badge1.payload.claims.verification_level === 'preview');
  const expectedDigest = crypto.createHash('sha256')
    .update(canonicalJson({ age: 26, full_name: 'Jordan' }), 'utf8').digest('hex');
  check('claims digest = sha256(canonical {age, full_name}) — source values only, no derived booleans (D8)',
    badge1.payload.claims_digest === expectedDigest);

  check('fresh badge verifies ok', (await badgeService.verify(badge1)).ok === true);

  // Tamper: flipping the preview label inside the payload breaks the signature.
  const tampered = JSON.parse(JSON.stringify(badge1));
  tampered.payload.claims.verification_level = 'full';
  check('tampered claims fail with bad_signature', (await badgeService.verify(tampered)).reason === 'bad_signature');

  // Lazy revocation backstop: claim field changes, then someone verifies.
  // (verified=0 mirrors what the live profile-edit route does on revocation —
  // without it these rows would read as "legacy" to upgradeLegacyBadges.)
  mem.prepare("UPDATE users SET full_name = 'Jordana', verified = 0 WHERE id = 'user-1'").run();
  const lazyResult = await badgeService.verify(badge1);
  check('verify after name change fails with claims_changed', lazyResult.reason === 'claims_changed');
  const record1 = await badgeStore.get(badge1.payload.badge_id);
  check('lazy backstop auto-revoked the record with reason claim_change',
    record1.status === 'revoked' && record1.revoked_reason === 'claim_change');

  // Eager path: onClaimsChanged at profile-write time.
  const user2 = insertUser(mem, 'user-2', 'Casey', 29);
  const badge2 = await badgeService.issue({ subject_id: user2.id, claims: badgeClaims(user2) }, signer);
  mem.prepare("UPDATE users SET age = 30, verified = 0 WHERE id = 'user-2'").run();
  const revoked = await badgeService.onClaimsChanged('user-2');
  check('onClaimsChanged revokes exactly the stale badge', revoked.length === 1 && revoked[0].badge_id === badge2.payload.badge_id);
  check('eagerly revoked badge fails verify with badge_revoked', (await badgeService.verify(badge2)).reason === 'badge_revoked');

  // D9: re-issuing with UNCHANGED claims (the case none of the digest-based
  // revocation paths above ever catch) must still leave exactly one valid
  // badge — issueSuperseding revokes the old one the moment the new one
  // issues, not lazily at next verify().
  const user2b = insertUser(mem, 'user-2b', 'Taylor', 31);
  const badge2bOld = await badgeService.issue({ subject_id: user2b.id, claims: badgeClaims(user2b) }, signer);
  const badge2bNew = await issueSuperseding(badgeService, badgeStore, { subject_id: user2b.id, claims: badgeClaims(user2b) }, signer);
  check('superseding issue mints a distinct badge_id', badge2bNew.payload.badge_id !== badge2bOld.payload.badge_id);
  const oldRecord2b = await badgeStore.get(badge2bOld.payload.badge_id);
  check('old badge is revoked immediately on reissue, before any verify() call (D9)',
    oldRecord2b.status === 'revoked' && oldRecord2b.revoked_reason === 'manual', JSON.stringify(oldRecord2b));
  check('old badge fails verify with badge_revoked, not claims_changed',
    (await badgeService.verify(badge2bOld)).reason === 'badge_revoked');
  check('new badge verifies ok', (await badgeService.verify(badge2bNew)).ok === true);
  const stillValid2b = await badgeStore.listValidBySubject('user-2b');
  check('exactly one valid badge remains for the subject',
    stillValid2b.length === 1 && stillValid2b[0].badge_id === badge2bNew.payload.badge_id, JSON.stringify(stillValid2b));
  // Done proving D9 — revoke so this subject's badge doesn't leak into the
  // reissueAll block below, which asserts an exact set of still-valid badges
  // under REGISTERED_KEY_ID. Also drop verified (mirrors what the live
  // profile-edit route does on revocation, same as user-1/user-2 above) so
  // this now-badgeless-but-verified=1 row doesn't get swept up by
  // upgradeLegacyBadges' "verified with no valid badge" query next.
  await badgeService.revokeBadge(badge2bNew.payload.badge_id);
  mem.prepare("UPDATE users SET verified = 0 WHERE id = 'user-2b'").run();

  // Legacy upgrade: verified user with the old hand-signed format and no
  // badge record gets a real BadgeService badge.
  const user3 = insertUser(mem, 'user-3', 'Riley', 24);
  mem.prepare("UPDATE users SET verification_badge = ? WHERE id = 'user-3'")
    .run(JSON.stringify({ payload: { user_id: 'user-3', verified: true, status: 'preview' }, signature: 'legacy' }));
  const upgraded = await upgradeLegacyBadges(mem, badgeService, signer);
  check('legacy badge upgraded (exactly the one legacy row)', upgraded === 1);
  const upgradedBadge = JSON.parse(mem.prepare("SELECT verification_badge FROM users WHERE id = 'user-3'").get().verification_badge);
  check('upgraded mirror is a real SignedBadge that verifies', (await badgeService.verify(upgradedBadge)).ok === true);
  check('upgrade is idempotent', (await upgradeLegacyBadges(mem, badgeService, signer)) === 0);

  // Key compromise: rotate a new key in, reissue everything still valid
  // under the old key, then revoke the old key.
  const user4 = insertUser(mem, 'user-4', 'Morgan', 33);
  const badge4 = await badgeService.issue({ subject_id: user4.id, claims: badgeClaims(user4) }, signer);
  const user5 = insertUser(mem, 'user-5', 'Drew', 30);
  const badge5 = await badgeService.issue({ subject_id: user5.id, claims: badgeClaims(user5) }, signer);
  mem.prepare("UPDATE users SET full_name = 'Drewb' WHERE id = 'user-5'").run(); // stale claims → must be skipped

  const { privateKey: newPriv, publicKey: newPub } = crypto.generateKeyPairSync('ed25519');
  const newPubHex = Buffer.from(newPub.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const newKey = await keyManager.rotate(newPubHex);
  const newSigner = async (message) => crypto.sign(null, message, newPriv);

  const { reissued, skipped } = await badgeService.reissueAll(REGISTERED_KEY_ID, newSigner);
  // Still valid under the old key at this point: user-3's upgraded badge and
  // user-4's — both claims-intact, both must be reissued. user-5 must not be.
  const reissuedSubjects = reissued.map((b) => b.payload.subject_id).sort();
  check('reissueAll reissues every still-valid, claims-intact badge',
    JSON.stringify(reissuedSubjects) === JSON.stringify(['user-3', 'user-4']), JSON.stringify(reissuedSubjects));
  check('reissued badges are signed by the NEW key', reissued.every((b) => b.payload.key_id === newKey.key_id));
  check('reissued badges verify ok',
    (await Promise.all(reissued.map((b) => badgeService.verify(b)))).every((r) => r.ok === true));
  check('claims-changed badge is skipped, not silently reissued',
    skipped.length === 1 && skipped[0].badge_id === badge5.payload.badge_id && skipped[0].reason === 'claims_changed');
  const record4 = await badgeStore.get(badge4.payload.badge_id);
  check('old badge record revoked with reason key_compromise',
    record4.status === 'revoked' && record4.revoked_reason === 'key_compromise');

  await keyManager.revoke(REGISTERED_KEY_ID);
  const upgradedResult = await badgeService.verify(upgradedBadge); // user-3's badge, still on the old key
  check('after key revocation, remaining old-key badges fail with key_revoked', upgradedResult.reason === 'key_revoked');
}

// ── Part 2: HTTP against a live server on 3050 ──

async function api(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function part2() {
  console.log('\n— Part 2: HTTP flow against a live server on :3050 —');

  const server = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3050' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });

  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      up = await fetch(`${BASE}/hello`).then((r) => r.ok).catch(() => false);
    }
    if (!up) throw new Error(`server never came up on 3050. log:\n${serverLog}`);

    const db = require('./db');
    check('users.doc_hmac column is gone from the live schema',
      !db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'doc_hmac'));

    const run = Date.now();
    const email = `mod3-${run}@example.com`;
    const docX = { document_type: 'passport', issuing_country: 'US', document_number: `MOD3X${run}` };
    const attestBody = { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2031-01-01' };

    const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2secure' } });
    const token = signup.body.session_token;
    await api('/users', { method: 'POST', token, body: { first_name: 'Mod3', age: 28, gender: 'Female' } });

    // Full issuance flow.
    await api('/verification/document-check', { method: 'POST', token, body: docX });
    const attest = await api('/verification/attest', { method: 'POST', token, body: attestBody });
    check('attest → 200 with verified=1', attest.status === 200 && attest.body?.verified === 1, JSON.stringify(attest.body?.error ?? attest.status));

    const signedBadge = JSON.parse(attest.body.verification_badge);
    const userId = db.prepare('SELECT u.id FROM users u JOIN accounts a ON u.account_id = a.id WHERE a.email = ?').get(email).id;
    check('live badge is a v1 SignedBadge for users.id (D7)',
      signedBadge.payload?.v === 1 && signedBadge.payload.subject_id === userId);
    check('live badge signed under the registered key', signedBadge.payload.key_id === REGISTERED_KEY_ID);

    const { badgeService } = await makeBadgeService(db);
    check('live badge verifies through the library', (await badgeService.verify(signedBadge)).ok === true);
    const publicKey = await api('/verification/public-key');
    check('public-key route serves the KeyManager record',
      publicKey.status === 200 && publicKey.body?.key_id === REGISTERED_KEY_ID && /^[0-9a-f]{64}$/.test(publicKey.body?.public_key ?? ''));

    // Revocation-on-claim-change through the live profile-edit route.
    const edit = await api('/users', { method: 'POST', token, body: { first_name: 'Mod3renamed', age: 28, gender: 'Female' } });
    check('editing a claim field flips verified off in the same response',
      edit.status === 200 && edit.body?.verified === 0 && edit.body?.verification_badge === null, JSON.stringify({ v: edit.body?.verified }));
    const revokedRecord = db.prepare("SELECT status, revoked_reason FROM badges WHERE badge_id = ?").get(signedBadge.payload.badge_id);
    check('badge record revoked with reason claim_change',
      revokedRecord?.status === 'revoked' && revokedRecord?.revoked_reason === 'claim_change');
    check('revoked badge no longer verifies', (await badgeService.verify(signedBadge)).ok === false);

    // Re-verification issues a fresh badge (same subject, same document —
    // module 2's refresh semantics + a new module 3 badge).
    await api('/verification/document-check', { method: 'POST', token, body: docX });
    const reattest = await api('/verification/attest', { method: 'POST', token, body: attestBody });
    const freshBadge = JSON.parse(reattest.body.verification_badge);
    check('re-verification issues a fresh valid badge',
      reattest.body?.verified === 1 && freshBadge.payload.badge_id !== signedBadge.payload.badge_id);
    check('fresh badge verifies ok', (await badgeService.verify(freshBadge)).ok === true);

    // D9 on the live route: re-attest AGAIN with claims unchanged this time
    // (no profile edit in between) — the case the claim_change path above
    // never exercises, since that one already had a stale digest going in.
    await api('/verification/document-check', { method: 'POST', token, body: docX });
    const reattest2 = await api('/verification/attest', { method: 'POST', token, body: attestBody });
    const thirdBadge = JSON.parse(reattest2.body.verification_badge);
    check('re-attest with unchanged claims still issues a fresh badge',
      reattest2.body?.verified === 1 && thirdBadge.payload.badge_id !== freshBadge.payload.badge_id);
    const supersededRecord = db.prepare('SELECT status, revoked_reason FROM badges WHERE badge_id = ?').get(freshBadge.payload.badge_id);
    check('previous badge superseded immediately (D9), reason manual — not claim_change',
      supersededRecord?.status === 'revoked' && supersededRecord?.revoked_reason === 'manual', JSON.stringify(supersededRecord));
    check('third badge verifies ok', (await badgeService.verify(thirdBadge)).ok === true);
    const validForUser = db.prepare("SELECT COUNT(*) AS n FROM badges WHERE subject_id = ? AND status = 'valid'").get(userId).n;
    check('exactly one valid badge remains for this subject after two re-attests', validForUser === 1, validForUser);

    // Cleanup: only this run's rows.
    const accountId = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email).id;
    new SqliteBadgeStore(db).deleteBySubjectIds([userId]);
    new SqliteDocumentHashStore(db).deleteBySubjectIds([userId]);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
    console.log('cleaned up 1 test account, its user row, badges, and claims');
  } finally {
    server.kill();
  }
}

(async () => {
  await part1();
  await part2();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
