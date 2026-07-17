// Standalone test for the badge-presentation-surface (D10, badgeStore.js) —
// run with `node test-recryption-badge-reveal.js` from backend/. Starts its
// own server on port 3050 for the HTTP half (per CLAUDE.md, never 3000).
//
// D10: both sides verify, independently.
// Part 1 (no server): mobile/verification/badgeVerify.js — the on-device
// half — required DIRECTLY (not reimplemented) so this proves the real
// code path a screen imports actually verifies a genuine badge and rejects
// a tampered one.
// Part 2 (HTTP, real dev db, self-cleanup): GET /matching/partner-badge —
// the server-side gate — serves a verified partner's badge, refuses to
// serve an unverified or revoked one (same shape either way, no reason
// leaked), and 404s with no confirmed pairing. Also proves the two checks
// are independent: a badge tampered AFTER a legitimate server response
// still fails the client's own check.
require('./env');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const { makeBadgeService, badgeClaims } = require('./recryption/badgeStore');
const { verifySignedBadge } = require('../mobile/verification/badgeVerify');

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
  console.log('— Part 1: mobile/verification/badgeVerify.js against a real Recryption badge —');
  const mem = freshMemDb();
  const { badgeService, signer, keyManager } = await makeBadgeService(mem);
  const activeKey = await keyManager.getActiveKey();

  mem.prepare(`INSERT INTO accounts (id, email, password_hash) VALUES ('acct-p1', 'p1@example.com', 'x')`).run();
  mem.prepare(`
    INSERT INTO users (id, account_id, full_name, display_name, age, gender, verified)
    VALUES ('user-p1', 'acct-p1', 'Presley', 'Presley', 27, 'Female', 1)
  `).run();

  const signed = await badgeService.issue({ subject_id: 'user-p1', claims: badgeClaims({ display_name: 'Presley' }) }, signer);

  check('valid badge verifies on-device against the real public key',
    verifySignedBadge(signed, activeKey.public_key) === true);

  const tamperedClaim = JSON.parse(JSON.stringify(signed));
  tamperedClaim.payload.claims.display_name = 'Attacker';
  check('claim-tampered badge fails on-device verification',
    verifySignedBadge(tamperedClaim, activeKey.public_key) === false);

  const tamperedSig = JSON.parse(JSON.stringify(signed));
  tamperedSig.sig = tamperedSig.sig.slice(0, -2) + (tamperedSig.sig.slice(-2) === '00' ? '11' : '00');
  check('signature-tampered badge fails on-device verification',
    verifySignedBadge(tamperedSig, activeKey.public_key) === false);

  const wrongKey = '0'.repeat(64);
  check('badge fails on-device verification against the wrong public key',
    verifySignedBadge(signed, wrongKey) === false);

  check('malformed input (no payload) fails closed, does not throw',
    verifySignedBadge({ sig: 'aa' }, activeKey.public_key) === false);
  check('malformed input (garbage hex sig) fails closed, does not throw',
    verifySignedBadge({ payload: signed.payload, sig: 'not-hex!' }, activeKey.public_key) === false);
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

async function signupAndProfile(run, label) {
  const email = `reveal-${label}-${run}@example.com`;
  const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'hunter2secure' } });
  const token = signup.body.session_token;
  await api('/users', { method: 'POST', token, body: { first_name: label, age: 29, gender: 'Female' } });
  return { email, token };
}

async function verifyAccount(token, run, label) {
  const doc = { document_type: 'passport', issuing_country: 'US', document_number: `REVEAL${label}${run}` };
  await api('/verification/document-check', { method: 'POST', token, body: doc });
  const attest = await api('/verification/attest', {
    method: 'POST',
    token,
    body: { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2031-01-01' },
  });
  return attest;
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
    const run = Date.now();

    const alex = await signupAndProfile(run, 'alex');
    const bailey = await signupAndProfile(run, 'bailey');
    const casey = await signupAndProfile(run, 'casey'); // stays unpaired

    const alexAttest = await verifyAccount(alex.token, run, 'ALEX');
    check('alex verified with a real badge', alexAttest.status === 200 && alexAttest.body?.verified === 1);
    const alexBadge = JSON.parse(alexAttest.body.verification_badge);

    const alexId = db.prepare('SELECT u.id FROM users u JOIN accounts a ON u.account_id = a.id WHERE a.email = ?').get(alex.email).id;
    const baileyId = db.prepare('SELECT u.id FROM users u JOIN accounts a ON u.account_id = a.id WHERE a.email = ?').get(bailey.email).id;
    const caseyId = db.prepare('SELECT u.id FROM users u JOIN accounts a ON u.account_id = a.id WHERE a.email = ?').get(casey.email).id;

    // Bailey stays unverified — proves "no valid badge" reads the same as
    // "verified badge exists but fails a check," not a special case.
    const pairingId = `reveal-pairing-${run}`;
    db.prepare(`
      INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status, score)
      VALUES (?, ?, ?, 'reveal-demo-shift', 'confirmed', 0.8)
    `).run(pairingId, alexId, baileyId);

    // Bailey's view of Alex: verified, real badge served.
    const baileyView = await api('/matching/partner-badge', { token: bailey.token });
    check('unverified partner sees verified:true, a badge, when their confirmed partner IS verified',
      baileyView.status === 200 && baileyView.body?.verified === true && baileyView.body?.badge?.payload?.badge_id === alexBadge.payload.badge_id,
      JSON.stringify(baileyView.body));

    const publicKey = await api('/verification/public-key');
    check('served badge verifies on-device against the served public key (both D10 checks agree)',
      verifySignedBadge(baileyView.body.badge, publicKey.body.public_key) === true);

    // Alex's view of Bailey: Bailey has no valid badge at all.
    const alexView = await api('/matching/partner-badge', { token: alex.token });
    check('verified partner sees verified:false, badge:null, when their confirmed partner is NOT verified',
      alexView.status === 200 && alexView.body?.verified === false && alexView.body?.badge === null,
      JSON.stringify(alexView.body));

    // Revoke Alex's badge (claim-change, exercised the same way as the
    // badges test suite) — the server-side gate must stop serving it.
    const editAlex = await api('/users', { method: 'POST', token: alex.token, body: { first_name: 'Alexrenamed', age: 29, gender: 'Female' } });
    check('editing a claim field revokes alex\'s badge', editAlex.status === 200 && editAlex.body?.verified === 0);

    const baileyViewAfterRevoke = await api('/matching/partner-badge', { token: bailey.token });
    check('a revoked badge is never served — same verified:false/badge:null shape as no badge at all',
      baileyViewAfterRevoke.status === 200 && baileyViewAfterRevoke.body?.verified === false && baileyViewAfterRevoke.body?.badge === null,
      JSON.stringify(baileyViewAfterRevoke.body));

    // No confirmed pairing at all.
    const caseyView = await api('/matching/partner-badge', { token: casey.token });
    check('no confirmed pairing → 404', caseyView.status === 404, JSON.stringify(caseyView.body));

    // Defense in depth: even if a badge were somehow served after tampering
    // (the server-side gate is what actually prevents this — see above),
    // the client's own independent check still rejects it.
    const tampered = JSON.parse(JSON.stringify(alexBadge));
    tampered.payload.claims.display_name = 'Someone else';
    check('a tampered badge fails the on-device check even if it had been served',
      verifySignedBadge(tampered, publicKey.body.public_key) === false);

    // Cleanup: only this run's rows.
    db.prepare('DELETE FROM pairings WHERE id = ?').run(pairingId);
    const { SqliteBadgeStore } = require('./recryption/badgeStore');
    const { SqliteDocumentHashStore } = require('./recryption/hashStore');
    const userIds = [alexId, baileyId, caseyId];
    new SqliteBadgeStore(db).deleteBySubjectIds(userIds);
    new SqliteDocumentHashStore(db).deleteBySubjectIds(userIds);
    for (const id of userIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
    for (const email of [alex.email, bailey.email, casey.email]) {
      db.prepare('DELETE FROM accounts WHERE email = ?').run(email);
    }
    console.log('cleaned up 3 test accounts, their user rows, badges, claims, and the test pairing');
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
