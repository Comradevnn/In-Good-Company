require('./env'); // loads backend/.env into process.env (no dependency)
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const { normalizeDocumentIdentity, docHmacHex } = require('./docIdentity');
const { hardFiltersPass, passesShiftGate, safeParseArray } = require('./matching/engine');
const { DEMO_SHIFTS } = require('./matching/demoShifts');

const BCRYPT_ROUNDS = 10;

// ── Identity verification: platform badge-signing key (Ed25519) ──
// Generated on first run, persisted under backend/keys/ (gitignored) so
// issued badges stay verifiable across restarts. In production this would
// live in a KMS; a local PEM file is the honest prototype version.
const KEYS_DIR = path.join(__dirname, 'keys');
const BADGE_KEY_PATH = path.join(KEYS_DIR, 'badge-signing-key.pem');

function loadOrCreateBadgeKey() {
  if (!fs.existsSync(BADGE_KEY_PATH)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(BADGE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  const privateKey = crypto.createPrivateKey(fs.readFileSync(BADGE_KEY_PATH));
  const publicKey = crypto.createPublicKey(privateKey);
  return { privateKey, publicKey };
}

const badgeKeys = loadOrCreateBadgeKey();

// Pepper for the duplicate-document HMAC (spec point 9). Supplied only via
// the DOC_PEPPER environment variable (backend/.env is loaded by ./env.js);
// there is deliberately no fallback — the old hardcoded dev default is in
// public git history, so any default value defeats the secret-keyed HMAC.
// PROTOTYPE NOTE: GET /verification/config still serves this to
// authenticated clients so the on-device HMAC flow keeps working; that
// exposure is a known open issue pending a decision on moving HMAC
// computation server-side.
const DOC_PEPPER = process.env.DOC_PEPPER;
if (!DOC_PEPPER) {
  console.error('DOC_PEPPER is not set. Add DOC_PEPPER=<secret> to backend/.env (or the environment) before starting.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return 'localhost';
}

app.get('/', (req, res) => {
  res.send('In Good Company backend is running');
});

app.get('/hello', (req, res) => {
  res.json({ message: 'hello' });
});

// Signup ("emailCapture" in specs/plotline.html): creates a login account.
// The profile row comes later, from the quickProfile step. Returns a session
// token the app stores on-device to stay logged in.
app.post('/auth/signup', async (req, res) => {
  const { email, password } = req.body ?? {};

  const emailTrimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM accounts WHERE email = ?').get(emailTrimmed);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const sessionToken = crypto.randomBytes(32).toString('hex');

  db.prepare(`
    INSERT INTO accounts (email, password_hash, session_token)
    VALUES (?, ?, ?)
  `).run(emailTrimmed, passwordHash, sessionToken);

  const account = db.prepare('SELECT id, email FROM accounts WHERE email = ?').get(emailTrimmed);
  res.status(201).json({ account_id: account.id, email: account.email, session_token: sessionToken });
});

// Login for an existing account — checks the password against the stored
// bcrypt hash, issues a fresh session token on success.
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  const emailTrimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const account = db.prepare('SELECT id, email, password_hash FROM accounts WHERE email = ?').get(emailTrimmed);
  if (!account) {
    return res.status(404).json({ error: 'No account with that email.' });
  }

  const passwordOk = typeof password === 'string' && await bcrypt.compare(password, account.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE accounts SET session_token = ? WHERE id = ?').run(sessionToken, account.id);

  res.status(200).json({ account_id: account.id, email: account.email, session_token: sessionToken });
});

// Resolves "Authorization: Bearer <token>" to an account, or rejects with 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const account = token
    ? db.prepare('SELECT id, email FROM accounts WHERE session_token = ?').get(token)
    : null;
  if (!account) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  req.account = account;
  next();
}

// Onboarding step 1 ("quickProfile" in specs/plotline.html): first name, age,
// occupation/school, gender, hobbies, personal values, and the intro blurb,
// saved against the logged-in account. Creates the profile row on first
// submit, updates it on resubmit. Every other users column is left to the
// schema's own defaults (see backend/db/schema.sql).
app.post('/users', requireAuth, (req, res) => {
  const { first_name, age, occupation, gender, hobbies, blurb, personal_values } = req.body ?? {};

  if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
    return res.status(400).json({ error: 'first_name is required' });
  }
  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber <= 0) {
    return res.status(400).json({ error: 'age must be a positive integer' });
  }
  if (!gender || typeof gender !== 'string' || !gender.trim()) {
    return res.status(400).json({ error: 'gender is required' });
  }

  const interestTags = typeof hobbies === 'string'
    ? hobbies.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];

  const profile = {
    account_id: req.account.id,
    full_name: first_name.trim(),
    display_name: first_name.trim(),
    age: ageNumber,
    gender: gender.trim(),
    occupation: typeof occupation === 'string' ? occupation.trim() : null,
    interest_tags: JSON.stringify(interestTags),
    bio: typeof blurb === 'string' ? blurb.trim() : null,
    personal_values: typeof personal_values === 'string' ? personal_values.trim() : null,
  };

  const existing = db.prepare('SELECT id, full_name, age, verified FROM users WHERE account_id = ?').get(req.account.id);
  if (existing) {
    // Editing name/age after verification: allowed, but the Verified badge
    // attests specifically to these two fields (see specs/identity-
    // verification-encryption-spec.md) — changing either while verified
    // would leave a signed badge silently claiming a name/age the profile
    // no longer has. Server-enforced (not client-trusted) so this can't be
    // bypassed by a client that doesn't send the right flag: revoke here,
    // in the same update, whenever they actually change.
    const identityChanged = existing.full_name !== profile.full_name || existing.age !== profile.age;
    const revoke = Boolean(existing.verified) && identityChanged;

    db.prepare(`
      UPDATE users SET
        full_name = @full_name, display_name = @display_name, age = @age,
        gender = @gender, occupation = @occupation, interest_tags = @interest_tags,
        bio = @bio, personal_values = @personal_values, updated_at = datetime('now')
        ${revoke ? ", verified = 0, verified_at = NULL, verification_badge = NULL, doc_hmac = NULL" : ''}
      WHERE account_id = @account_id
    `).run(profile);
  } else {
    db.prepare(`
      INSERT INTO users (account_id, full_name, display_name, age, gender, occupation, interest_tags, bio, personal_values)
      VALUES (@account_id, @full_name, @display_name, @age, @gender, @occupation, @interest_tags, @bio, @personal_values)
    `).run(profile);
  }

  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(existing ? 200 : 201).json(user);
});

// Returns the full current profile for the logged-in account, so the app can
// resume onboarding where the user left off instead of always starting over.
// 404s if the profile row doesn't exist yet (quickProfile not submitted).
app.get('/users/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  if (!user) {
    return res.status(404).json({ error: 'No profile yet.' });
  }
  res.status(200).json(user);
});

// Requires the account to already have a profile row (created by POST /users)
// before any of the later onboarding steps can save against it.
function requireProfile(req, res, next) {
  const user = db.prepare('SELECT id FROM users WHERE account_id = ?').get(req.account.id);
  if (!user) {
    return res.status(404).json({ error: 'Complete your profile before continuing.' });
  }
  next();
}

// Onboarding steps 2-5+ (location, org-or-cause, causes, partner preferences,
// availability) all save through here — each screen sends only the fields it
// collects, and only those columns are updated. See specs/
// volunteer-pairing-app-master-prompt.md section 3.1 for the full field list.
const PATCHABLE_FIELDS = [
  'location_city',
  'location_lat',
  'location_lng',
  'prospective_org_name',
  'cause_tags',
  'gender_pref',
  'seeking',
  'volunteering_frequency',
  'availability_window_start',
  'availability_window_end',
  'travel_radius_miles',
];

app.patch('/users/me', requireAuth, requireProfile, (req, res) => {
  const body = req.body ?? {};
  const updates = {};

  for (const field of PATCHABLE_FIELDS) {
    if (!(field in body)) continue;

    if (field === 'cause_tags') {
      if (!Array.isArray(body.cause_tags) || !body.cause_tags.every((tag) => typeof tag === 'string')) {
        return res.status(400).json({ error: 'cause_tags must be an array of strings' });
      }
      updates.cause_tags = JSON.stringify(body.cause_tags);
    } else if (field === 'gender_pref') {
      if (!['same_gender_only', 'any'].includes(body.gender_pref)) {
        return res.status(400).json({ error: "gender_pref must be 'same_gender_only' or 'any'" });
      }
      updates.gender_pref = body.gender_pref;
    } else if (field === 'seeking') {
      if (!['friendship_only', 'open'].includes(body.seeking)) {
        return res.status(400).json({ error: "seeking must be 'friendship_only' or 'open'" });
      }
      updates.seeking = body.seeking;
    } else if (field === 'location_lat' || field === 'location_lng' || field === 'travel_radius_miles') {
      const num = Number(body[field]);
      if (body[field] !== null && Number.isNaN(num)) {
        return res.status(400).json({ error: `${field} must be a number or null` });
      }
      updates[field] = body[field] === null ? null : num;
    } else {
      updates[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No recognized fields provided.' });
  }

  // gender_pref/seeking both default to valid values, so submitting either
  // one is the only signal that the user actually confirmed this screen
  // rather than just sitting on defaults — needed for onboarding resume logic.
  if ('gender_pref' in updates || 'seeking' in updates) {
    updates.partner_prefs_confirmed = 1;
  }

  const setClause = Object.keys(updates).map((field) => `${field} = @${field}`).join(', ');
  db.prepare(`UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE account_id = @account_id`)
    .run({ ...updates, account_id: req.account.id });

  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(200).json(user);
});

// ── Identity verification routes ──
// Prototype scope per the planning decisions: manual-entry extraction (no
// scanning SDK), no selfie/face-match, no retained ID imagery anywhere.
// What persists: attestation result, doc_hmac, signed "preview" badge.
//
// D6 (Option A): document-number hashing happens SERVER-SIDE. The plaintext
// number is accepted transiently at exactly one endpoint
// (POST /verification/document-check), hashed in memory, and discarded —
// never stored, logged, or echoed back. If request-body logging or an
// APM/error tracker is ever added to this app, that route must be excluded
// from payload capture. An OPRF is the recorded future upgrade path that
// would restore "number never reaches the server" without giving up the
// server-held pepper; it is deliberately not built at this scale.

// D6 tombstone: the pepper is no longer distributed to clients. Old app
// versions that still call this to hash on-device must fail loudly here —
// not quietly hash with a stale value and submit unmatchable tags.
app.get('/verification/config', requireAuth, (req, res) => {
  res.status(410).json({
    error: 'On-device document hashing is no longer supported. Update the app to continue verification.',
  });
});

// Staged results from document-check: attest no longer receives any document
// data from the client, so the server-computed hash waits here (briefly, in
// memory) for the same account's follow-up attest call. Single-process
// prototype scope, like the rest of this file.
const PENDING_DOC_CHECK_TTL_MS = 10 * 60 * 1000;
const pendingDocChecks = new Map(); // account_id -> { hmac, expiresAt }

// Per-account velocity limit (D6 point 6): verification is a rare action, so
// a tight cap costs honest users nothing while stopping a client from
// brute-forcing candidate document numbers at server speed.
const DOC_CHECK_LIMIT = 10;
const DOC_CHECK_WINDOW_MS = 60 * 60 * 1000;
const docCheckHistory = new Map(); // account_id -> [timestamps]

function underDocCheckLimit(accountId) {
  const now = Date.now();
  const recent = (docCheckHistory.get(accountId) || []).filter((t) => now - t < DOC_CHECK_WINDOW_MS);
  recent.push(now);
  docCheckHistory.set(accountId, recent);
  return recent.length <= DOC_CHECK_LIMIT;
}

// D6: the one endpoint that accepts the plaintext document fields. Computes
// the normalized HMAC in memory, answers only the duplicate question, and
// stages the hash for the follow-up attest. Validation errors are static
// strings — the submitted values are never echoed.
app.post('/verification/document-check', requireAuth, requireProfile, (req, res) => {
  if (!underDocCheckLimit(req.account.id)) {
    return res.status(429).json({ error: 'Too many document checks. Try again in an hour.' });
  }

  const normalized = normalizeDocumentIdentity(req.body ?? {});
  if (!normalized) {
    return res.status(400).json({
      error: 'document_type, issuing_country, and document_number are required; the number must contain letters or digits, and ":" is not allowed in type or country.',
    });
  }

  const hmac = docHmacHex(DOC_PEPPER, normalized);

  // One document, one account — same guard as before, now server-computed.
  // The other account's identity is deliberately not returned to the client.
  const dupe = db.prepare('SELECT account_id FROM users WHERE doc_hmac = ? AND account_id != ?')
    .get(hmac, req.account.id);
  if (dupe) {
    return res.status(200).json({ duplicate: true });
  }

  pendingDocChecks.set(req.account.id, { hmac, expiresAt: Date.now() + PENDING_DOC_CHECK_TTL_MS });
  res.status(200).json({ duplicate: false });
});

// Orgs (and tests) verify badge signatures against this.
app.get('/verification/public-key', (req, res) => {
  res.type('text/plain').send(badgeKeys.publicKey.export({ type: 'spki', format: 'pem' }));
});

// Receives the on-device attestation (spec point 8 shape). The document hash
// comes from this account's recent document-check staging (D6) — never from
// the client. The device signature slot is stubbed at prototype stage — no
// hardware key without a dev build — so transport trust is TLS only.
app.post('/verification/attest', requireAuth, requireProfile, (req, res) => {
  const { name_match, dob_match, doc_type_confirmed, expiry_date } = req.body ?? {};

  for (const [field, value] of Object.entries({ name_match, dob_match, doc_type_confirmed })) {
    if (value !== true) {
      // Server re-checks what the device asserts; a failed local check
      // should never have been submitted, but don't trust the client.
      return res.status(400).json({ error: `Verification failed: ${field} is not true.` });
    }
  }

  // V3: expiry is actually checked, not just extracted and ignored.
  if (typeof expiry_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
    return res.status(400).json({ error: 'expiry_date must be a YYYY-MM-DD date.' });
  }
  if (expiry_date <= new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'This document is expired.' });
  }

  const staged = pendingDocChecks.get(req.account.id);
  if (!staged || staged.expiresAt < Date.now()) {
    pendingDocChecks.delete(req.account.id);
    return res.status(400).json({ error: 'No recent document check. Start verification again.' });
  }
  const doc_hmac = staged.hmac;

  // V4: one document, one account — re-checked at commit time in case another
  // account verified the same document between check and attest.
  const dupe = db.prepare('SELECT account_id FROM users WHERE doc_hmac = ? AND account_id != ?')
    .get(doc_hmac, req.account.id);
  if (dupe) {
    pendingDocChecks.delete(req.account.id);
    return res.status(409).json({ error: 'This document has already verified another account.' });
  }

  const user = db.prepare('SELECT id, display_name FROM users WHERE account_id = ?').get(req.account.id);

  // Ed25519-signed badge. status "preview" is part of the SIGNED payload:
  // until a real scanning SDK replaces manual entry, verified means
  // "completed the flow," not "identity confirmed" — the badge itself must
  // never claim more than the pipeline can back.
  const badgePayload = {
    user_id: user.id,
    display_name: user.display_name,
    verified: true,
    status: 'preview',
    issued_at: new Date().toISOString(),
  };
  const payloadJson = JSON.stringify(badgePayload);
  const signature = crypto.sign(null, Buffer.from(payloadJson), badgeKeys.privateKey).toString('base64');
  const badge = JSON.stringify({ payload: badgePayload, signature });

  db.prepare(`
    UPDATE users SET
      verified = 1, verified_at = datetime('now'), doc_hmac = @doc_hmac,
      verification_badge = @badge, updated_at = datetime('now')
    WHERE account_id = @account_id
  `).run({ doc_hmac, badge, account_id: req.account.id });
  pendingDocChecks.delete(req.account.id);

  const updated = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(200).json(updated);
});

// ── Matching engine ──
// Minimal Step 1a + 1b implementation (see backend/matching/engine.js for
// exactly what's included vs. skipped relative to the full spec). Runs
// against real user rows and a hardcoded list of demo shifts
// (backend/matching/demoShifts.js) — there's no real shifts/orgs data model
// yet, so this is what a "shift" means in this build.

// Plain-text console narration of each matching run, for demo purposes —
// deliberately readable prose, not JSON dumps, so this terminal can be
// shown on screen during a live walkthrough.
function logMatch(line) {
  console.log(`[matching] ${line}`);
}

// Turns a raw 0-1 alignment score into a plain-language read, so the log
// says what the number actually means instead of just printing it.
function describeScore(score) {
  if (score >= 0.95) return 'excellent alignment — exact cause match on both sides';
  if (score >= 0.75) return 'strong alignment';
  return 'workable alignment — clears the 0.5 minimum threshold, but only barely';
}

function describeAlignment(gate) {
  const { shiftAlignment, orgAlignment, closeMatchUsed } = gate.alignment;
  return `shift=${shiftAlignment.toFixed(1)} org=${orgAlignment.toFixed(1)}${closeMatchUsed ? ' (via close-match adjacency, not an exact cause match)' : ''}`;
}

function buildMatchResponse(pairing, selfId) {
  const partnerId = pairing.user_a_id === selfId ? pairing.user_b_id : pairing.user_a_id;
  const partner = db.prepare('SELECT id, display_name, age, occupation FROM users WHERE id = ?').get(partnerId);
  const shift = DEMO_SHIFTS.find((s) => s.id === pairing.shift_id);
  return {
    status: 'confirmed',
    pairing_id: pairing.id,
    partner,
    // Minimal shift/org display info only — matches the spec's "brief
    // profile" minimization principle, not a wholesale dump of demo data.
    shift: shift
      ? {
          cause_tags: shift.cause_tags,
          org_name: shift.org.name,
          location_label: shift.location_label,
          date: shift.date,
          time: shift.time,
        }
      : null,
    score: pairing.score,
  };
}

app.post('/matching/run', requireAuth, requireProfile, (req, res) => {
  const self = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  logMatch(`${self.display_name} (${self.id}) requested a match.`);

  // Idempotent: an existing confirmed pairing is returned as-is rather than
  // recomputed, so re-opening the match screen doesn't risk finding (or
  // "un-finding") a different partner than before.
  const existingPairing = db.prepare(`
    SELECT * FROM pairings WHERE status = 'confirmed' AND (user_a_id = ? OR user_b_id = ?)
  `).get(self.id, self.id);
  if (existingPairing) {
    const response = buildMatchResponse(existingPairing, self.id);
    logMatch(`${self.display_name} already has a confirmed pairing with ${response.partner.display_name} — returning it unchanged.`);
    return res.json(response);
  }

  // Simplified guardrail check (full spec: missing verified/cause_tags/
  // location/gender_pref all route to 'ineligible_data_incomplete' as a
  // single reason; gender_pref always has a schema default so it's never
  // "missing," and a missing location is handled inside passesShiftGate by
  // skipping the radius check rather than blocking outright — so this only
  // checks the two fields that can actually be absent in a blocking way).
  if (!self.verified) {
    logMatch(`${self.display_name} is not verified — stopping before candidates are even checked.`);
    return res.json({ status: 'no_match', reason: 'verification_incomplete' });
  }
  if (safeParseArray(self.cause_tags).length === 0) {
    logMatch(`${self.display_name} has no cause tags set — stopping before candidates are even checked.`);
    return res.json({ status: 'no_match', reason: 'ineligible_data_incomplete' });
  }

  // DEMO SCOPED: booking a shift needs Deeds, checked here rather than the
  // real hold-on-confirm/forfeit-on-no-show lifecycle in master prompt 1.6.
  // Checked for both sides (booking is a two-person commitment) — a
  // candidate short on Deeds is skipped like a failed hard filter, not
  // matched and left unable to actually attend.
  if (self.deeds_balance < 5) {
    logMatch(`${self.display_name} has ${self.deeds_balance} Deed(s) — below the 5 needed to book a shift.`);
    return res.json({ status: 'no_match', reason: 'insufficient_deeds' });
  }

  // Candidates: everyone else with a profile, minus anyone already in a
  // confirmed pairing (their "slot" is taken).
  const pairedUserIds = new Set();
  for (const p of db.prepare(`SELECT user_a_id, user_b_id FROM pairings WHERE status = 'confirmed'`).all()) {
    pairedUserIds.add(p.user_a_id);
    pairedUserIds.add(p.user_b_id);
  }
  const candidates = db.prepare('SELECT * FROM users WHERE account_id != ?').all(req.account.id)
    .filter((candidate) => !pairedUserIds.has(candidate.id));
  logMatch(`Checking ${candidates.length} candidate(s): ${candidates.map((c) => c.display_name).join(', ') || '(none available)'}`);

  // First hard-filter-and-alignment-passing candidate wins — the full
  // spec's Step 3 soft ranking (which candidate scores highest) is skipped
  // entirely, see backend/matching/engine.js's header comment.
  for (const candidate of candidates) {
    const hardFilters = hardFiltersPass(self, candidate);
    if (!hardFilters.pass) {
      logMatch(`  ${candidate.display_name}: rejected at hard filters (${hardFilters.reasons.join(', ')})`);
      continue;
    }
    if (candidate.deeds_balance < 5) {
      logMatch(`  ${candidate.display_name}: rejected — only has ${candidate.deeds_balance} Deed(s), needs 5 to book`);
      continue;
    }

    let matchedShift = null;
    for (const shift of DEMO_SHIFTS) {
      const selfGate = passesShiftGate(self, shift);
      const candidateGate = passesShiftGate(candidate, shift);
      if (selfGate.pass && candidateGate.pass) {
        matchedShift = { shift, selfGate, candidateGate };
        break;
      }
    }

    if (!matchedShift) {
      logMatch(`  ${candidate.display_name}: passed hard filters, but no shift cleared alignment for both of you`);
      continue;
    }

    const { shift, selfGate, candidateGate } = matchedShift;
    const score = (selfGate.alignment.score + candidateGate.alignment.score) / 2;
    const inserted = db.prepare(`
      INSERT INTO pairings (user_a_id, user_b_id, shift_id, status, score)
      VALUES (?, ?, ?, 'confirmed', ?)
    `).run(self.id, candidate.id, shift.id, score);
    const pairing = db.prepare('SELECT * FROM pairings WHERE rowid = ?').get(inserted.lastInsertRowid);
    logMatch(`  ${candidate.display_name}: cleared "${shift.org.name}" (${shift.cause_tags.join(', ')}) on ${shift.date}, ${shift.time} at ${shift.location_label} — CONFIRMED`);
    logMatch(`    your alignment: ${describeAlignment(selfGate)} | their alignment: ${describeAlignment(candidateGate)}`);
    logMatch(`Result: ${self.display_name} paired with ${candidate.display_name} — combined score ${score.toFixed(2)} (${describeScore(score)}).`);
    return res.json(buildMatchResponse(pairing, self.id));
  }

  logMatch(`Result: no compatible partner found for ${self.display_name}.`);
  return res.json({ status: 'no_match', reason: 'no_compatible_partner_found' });
});

// DEMO SCOPED: cancels the user's active pairing so the match screen can
// reset and matching can be re-run, and forfeits the caller's 5-Deed
// booking cost. No notification to the other party, no reliability-
// tracking consequences (§3.4/§5.3's real backout rules) — this is just
// "make cancel-and-return-to-unmatched work with a Deeds cost," not the
// real hold/forfeit lifecycle. Only the person backing out loses Deeds,
// matching the real spec's "the person backed out on never eats the cost."
app.post('/matching/cancel', requireAuth, requireProfile, (req, res) => {
  const self = db.prepare('SELECT id, display_name, deeds_balance FROM users WHERE account_id = ?').get(req.account.id);
  const pairing = db.prepare(`
    SELECT * FROM pairings WHERE status = 'confirmed' AND (user_a_id = ? OR user_b_id = ?)
  `).get(self.id, self.id);

  if (!pairing) {
    return res.status(404).json({ error: 'No active pairing to cancel.' });
  }

  db.prepare(`UPDATE pairings SET status = 'cancelled' WHERE id = ?`).run(pairing.id);
  db.prepare('UPDATE users SET deeds_balance = deeds_balance - 5 WHERE id = ?').run(self.id);
  const newBalance = self.deeds_balance - 5;
  logMatch(`${self.display_name} backed out of their pairing (pairing ${pairing.id} cancelled, forfeited Deeds, balance now ${newBalance}).`);
  res.json({ status: 'cancelled', deeds_balance: newBalance });
});

// DEMO SCOPED: no real payment processing — just increments the balance by
// whatever pack was "bought." See schema.sql's deeds_balance comment.
app.post('/deeds/purchase', requireAuth, requireProfile, (req, res) => {
  const amount = Number(req.body?.deeds);
  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'deeds must be a positive integer.' });
  }
  db.prepare('UPDATE users SET deeds_balance = deeds_balance + ? WHERE account_id = ?').run(amount, req.account.id);
  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(200).json(user);
});

app.listen(port, () => {
  const ip = getLocalNetworkIp();
  console.log(`Backend running — reachable at http://${ip}:${port}`);
});
