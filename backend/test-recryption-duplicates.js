// Standalone test for Recryption integration module 2 (DuplicateDetector) —
// run with `node test-recryption-duplicates.js` from backend/. Starts its
// own server on port 3050 for the HTTP half (per CLAUDE.md, never 3000).
//
// Part 1 (in-memory db): detector semantics — record-on-check, true
// duplicate, same-subject refresh, normalization equivalence, invalid
// fields, and a direct proof that the library's HMAC matches the old
// createHmac('sha256', DOC_PEPPER) output (the pepper-bytes compatibility
// that made module 2's one-time users.doc_hmac carry-forward valid).
// Part 2 (HTTP, real dev db, self-cleanup): live duplicate/non-duplicate
// checks, the re-verification flow that used to 409 (CLAUDE.md known bug),
// stage-bypass rejection, static-message validation, and the velocity limit.
require('./env');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { SqliteDocumentHashStore, buildPepperConfig, makeDetector } = require('./recryption/hashStore');
const { loadRecryption } = require('./recryption/keyStore');

const BASE = 'http://localhost:3050';

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

async function part1() {
  console.log('— Part 1: detector semantics against an in-memory db —');
  const { InvalidDocumentError, normalizeDocumentIdentity } = await loadRecryption();
  const mem = freshMemDb();
  const { detector, store, pepperId } = await makeDetector(mem);

  const docA = { document_type: 'drivers_license', issuing_country: 'US', document_number: 'MOD2-TEST-001' };

  const first = await detector.checkDuplicate(docA, 'subject-1');
  check('fresh check returns duplicate:false', first.duplicate === false);
  const record = await store.findLatestBySubject('subject-1');
  check('claim recorded at check time', Boolean(record), 'no document_hashes row written');
  check('claim stamped with current pepper_id', record?.pepper_id === pepperId, `got ${record?.pepper_id}`);

  // Pepper-bytes compatibility: the library's HMAC equals the old
  // createHmac('sha256', DOC_PEPPER-as-string) output — the property that
  // made module 2's one-time users.doc_hmac carry-forward valid, kept as a
  // regression guard on the pepper wiring in buildPepperConfig().
  const legacyHmac = crypto
    .createHmac('sha256', process.env.DOC_PEPPER)
    .update(normalizeDocumentIdentity(docA))
    .digest('hex');
  check('library HMAC is byte-identical to the legacy createHmac output', record?.doc_hmac === legacyHmac);

  const other = await detector.checkDuplicate(docA, 'subject-2');
  check('same document, different subject → duplicate:true', other.duplicate === true);
  check('duplicate reports the existing subject', other.duplicate && other.existing_subject_id === 'subject-1');
  check('true duplicate writes nothing for the second subject', (await store.findLatestBySubject('subject-2')) === undefined);

  const again = await detector.checkDuplicate(docA, 'subject-1');
  check('same subject re-check → duplicate:false (refresh, not conflict)', again.duplicate === false);
  check(
    'refresh keeps exactly one claim row',
    mem.prepare('SELECT COUNT(*) AS n FROM document_hashes').get().n === 1
  );

  const messy = { document_type: '  Drivers_License ', issuing_country: 'us', document_number: 'mod2 test 001' };
  const messyResult = await detector.checkDuplicate(messy, 'subject-3');
  check('normalization folds case/spacing/punctuation into the same identity', messyResult.duplicate === true);

  let threw = false;
  try {
    await detector.checkDuplicate({ document_type: 'a:b', issuing_country: 'US', document_number: 'X1' }, 's');
  } catch (err) {
    threw = err instanceof InvalidDocumentError;
  }
  check('colon in document_type throws InvalidDocumentError', threw);

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

async function makeAccount(email, name) {
  const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2secure' } });
  const token = signup.body.session_token;
  await api('/users', { method: 'POST', token, body: { first_name: name, age: 28, gender: 'Female' } });
  return token;
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

    const run = Date.now();
    const emailA = `mod2-a-${run}@example.com`;
    const emailB = `mod2-b-${run}@example.com`;
    const docX = { document_type: 'passport', issuing_country: 'US', document_number: `MOD2X${run}` };
    const attestBody = { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2031-01-01' };

    const tokenA = await makeAccount(emailA, 'Mod2A');
    const tokenB = await makeAccount(emailB, 'Mod2B');

    const checkA = await api('/verification/document-check', { method: 'POST', token: tokenA, body: docX });
    check('A: fresh document-check → 200 {duplicate:false}', checkA.status === 200 && checkA.body?.duplicate === false, JSON.stringify(checkA));
    check('A: response shape is exactly {duplicate}', checkA.body && Object.keys(checkA.body).join(',') === 'duplicate');

    const attestA = await api('/verification/attest', { method: 'POST', token: tokenA, body: attestBody });
    check('A: attest commits verified status', attestA.status === 200 && attestA.body?.verified === 1, JSON.stringify(attestA.body?.error ?? attestA.status));

    // The CLAUDE.md known-bug scenario: same account, same document, again.
    const recheckA = await api('/verification/document-check', { method: 'POST', token: tokenA, body: docX });
    check('A: re-check of own document → duplicate:false (the old 409 bug scenario)', recheckA.status === 200 && recheckA.body?.duplicate === false);
    const reattestA = await api('/verification/attest', { method: 'POST', token: tokenA, body: attestBody });
    check('A: re-attest succeeds (409 bug structurally gone)', reattestA.status === 200 && reattestA.body?.verified === 1, JSON.stringify(reattestA.body?.error ?? reattestA.status));

    const checkB = await api('/verification/document-check', { method: 'POST', token: tokenB, body: docX });
    check("B: A's document → 200 {duplicate:true}", checkB.status === 200 && checkB.body?.duplicate === true);
    check('B: duplicate response leaks no other-account identity', checkB.body && Object.keys(checkB.body).join(',') === 'duplicate');

    // Stage-bypass: attest with a client-supplied hash and no fresh check.
    // (B's only check was a duplicate, which never stages.)
    const bypass = await api('/verification/attest', {
      method: 'POST',
      token: tokenB,
      body: { ...attestBody, doc_hmac: 'f'.repeat(64) },
    });
    check(
      'B: attest with client-supplied doc_hmac and no staged check → 400',
      bypass.status === 400 && /No recent document check/.test(bypass.body?.error ?? ''),
      JSON.stringify(bypass)
    );

    const invalid = await api('/verification/document-check', {
      method: 'POST',
      token: tokenB,
      body: { document_type: 'passport', issuing_country: 'U:S', document_number: `MOD2Y${run}` },
    });
    check('B: invalid fields → 400 with the static message (nothing echoed)', invalid.status === 400 && !String(invalid.body?.error).includes('MOD2Y'), JSON.stringify(invalid.body));

    // Velocity: B has used 2 checks (duplicate + invalid). The cap is 10 per
    // hour, so 8 more succeed and the 11th total is throttled.
    let throttled = null;
    for (let i = 0; i < 9; i++) {
      const r = await api('/verification/document-check', {
        method: 'POST',
        token: tokenB,
        body: { document_type: 'passport', issuing_country: 'US', document_number: `MOD2B${run}` },
      });
      if (r.status === 429) {
        throttled = { attempt: i + 3, response: r };
        break;
      }
    }
    check('B: 11th check inside the window → 429 velocity limit', throttled?.attempt === 11, JSON.stringify(throttled));

    // Confirm the committed state ended up consistent: A's claim exists in
    // document_hashes, subject-keyed to A's users.id (module 3 retired the
    // old users.doc_hmac mirror column — document_hashes is the only state).
    const db = require('./db');
    const rowA = db.prepare(`
      SELECT u.id FROM users u JOIN accounts a ON u.account_id = a.id WHERE a.email = ?
    `).get(emailA);
    const claimA = db.prepare('SELECT doc_hmac FROM document_hashes WHERE subject_id = ?').get(rowA.id);
    check("A: document_hashes holds A's claim, subject-keyed to users.id", Boolean(claimA?.doc_hmac));

    // Cleanup: only this run's rows — accounts, users, and their claims.
    const myAccounts = db.prepare('SELECT id FROM accounts WHERE email IN (?, ?)').all(emailA, emailB).map((r) => r.id);
    const myUsers = db.prepare(`SELECT id FROM users WHERE account_id IN (${myAccounts.map(() => '?').join(',')})`).all(...myAccounts).map((r) => r.id);
    if (myUsers.length > 0) {
      new SqliteDocumentHashStore(db).deleteBySubjectIds(myUsers);
      // Attest issues BadgeService badges since module 3 — clean those too.
      new (require('./recryption/badgeStore').SqliteBadgeStore)(db).deleteBySubjectIds(myUsers);
      db.prepare(`DELETE FROM users WHERE id IN (${myUsers.map(() => '?').join(',')})`).run(...myUsers);
    }
    db.prepare(`DELETE FROM accounts WHERE id IN (${myAccounts.map(() => '?').join(',')})`).run(...myAccounts);
    console.log(`cleaned up ${myAccounts.length} test account(s), ${myUsers.length} user row(s) and their claims`);
  } finally {
    server.kill();
  }
}

(async () => {
  // Sanity: the configured pepper passes the library's validation rules.
  const { validatePepperConfig } = await loadRecryption();
  validatePepperConfig(buildPepperConfig());
  console.log('pepper config: valid under Recryption rules\n');

  await part1();
  await part2();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
