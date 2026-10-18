require('./env'); // loads backend/.env into process.env (no dependency)
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const { makeDetector } = require('./recryption/hashStore');
const { makeBadgeService, badgeClaims, issueSuperseding, upgradeLegacyBadges } = require('./recryption/badgeStore');
const { requireAuth, requireProfile } = require('./lib/auth');
const rateLimit = require('./lib/rateLimit');
const services = require('./lib/services');
const clock = require('./lib/clock');
const { ownProfile } = require('./lib/serialize');
const { CAUSES } = require('./lib/causes');
const { isRealDate } = require('./lib/time');
const { containsContactInfo } = require('./lib/chat');
const referrals = require('./lib/referrals');
const lifecycle = require('./lib/lifecycle');
const volunteerRoutes = require('./routes/volunteer');
const orgRoutes = require('./routes/org');
const { admin: adminRoutes, dev: devRoutes, devToolsOn } = require('./routes/admin');

const BCRYPT_ROUNDS = 10;

// Identity verification runs through Recryption (backend/recryption/):
// DuplicateDetector owns duplicate-document state (module 2, hashStore.js);
// BadgeService + KeyManager own the badge lifecycle (module 3,
// badgeStore.js). The raw-PEM signing path is gone — signing goes through
// the library's Signer callback, and the PEM is touched only inside
// keyStore.js. All of these are assigned in main() before listen(); no
// route can observe them unset.
let docDetector = null;
let docHashStore = null;
let InvalidDocumentError = null;
let badgeService = null;
let badgeStore = null;
let badgeKeyManager = null;
let badgeSigner = null;

const app = express();
const port = process.env.PORT || 3000;

// Waiver uploads arrive as base64 JSON (see routes/org.js), so that one
// route accepts a few MB; everything else is capped small.
app.use('/orgs/mine/waiver', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '100kb' }));

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
  if (rateLimit.enabled()) {
    const limited = rateLimit.hit(`signup:${req.ip}`, 30, 60 * 60 * 1000);
    if (!limited.ok) return rateLimit.tooMany(res, limited.retryAfterSec);
  }
  const { email, password, kind = 'individual', referral_code } = req.body ?? {};

  const emailTrimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!['individual', 'org'].includes(kind)) {
    return res.status(400).json({ error: "kind must be 'individual' or 'org'." });
  }
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

  // created_at comes from the app clock (lib/clock.js), not SQLite's, so the
  // signup trial lines up with the dev clock when it has been fast-forwarded.
  db.prepare(`
    INSERT INTO accounts (email, password_hash, session_token, kind, referral_code_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(emailTrimmed, passwordHash, sessionToken, kind,
    typeof referral_code === 'string' ? referral_code.trim().toUpperCase() : null, clock.isoNow());

  const account = db.prepare('SELECT id, email, kind FROM accounts WHERE email = ?').get(emailTrimmed);
  res.status(201).json({ account_id: account.id, email: account.email, kind: account.kind, session_token: sessionToken });
});

// Login for an existing account — checks the password against the stored
// bcrypt hash, issues a fresh session token on success.
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  const emailTrimmed = typeof email === 'string' ? email.trim().toLowerCase() : '';
  // Failed attempts are limited per IP + email; all attempts, more loosely,
  // per IP — enough to stop bcrypt brute force without bothering real users.
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const failKey = `login-fail:${req.ip}:${emailTrimmed}`;
  if (rateLimit.enabled()) {
    const perIp = rateLimit.hit(`login:${req.ip}`, 100, LOGIN_WINDOW_MS);
    if (!perIp.ok) return rateLimit.tooMany(res, perIp.retryAfterSec);
    const retry = rateLimit.exceeded(failKey, 10, LOGIN_WINDOW_MS);
    if (retry != null) return rateLimit.tooMany(res, retry);
  }
  const account = db.prepare('SELECT id, email, kind, password_hash FROM accounts WHERE email = ?').get(emailTrimmed);
  if (!account) {
    if (rateLimit.enabled()) rateLimit.record(failKey);
    return res.status(404).json({ error: 'No account with that email.' });
  }

  const passwordOk = typeof password === 'string' && await bcrypt.compare(password, account.password_hash);
  if (!passwordOk) {
    if (rateLimit.enabled()) rateLimit.record(failKey);
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE accounts SET session_token = ? WHERE id = ?').run(sessionToken, account.id);

  res.status(200).json({ account_id: account.id, email: account.email, kind: account.kind, session_token: sessionToken });
});

// Ends this session server-side (the app also forgets the token locally).
app.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare('UPDATE accounts SET session_token = NULL WHERE id = ?').run(req.account.id);
  res.json({ ok: true });
});

// Which kind of account the stored session belongs to, so the app can route
// org logins to the org screens instead of volunteer onboarding.
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ account_id: req.account.id, email: req.account.email, kind: req.account.kind });
});

// Onboarding step 1 ("quickProfile" in specs/plotline.html): first name, age,
// occupation/school, gender, hobbies, personal values, and the intro blurb,
// saved against the logged-in account. Creates the profile row on first
// submit, updates it on resubmit. Every other users column is left to the
// schema's own defaults (see backend/db/schema.sql).
app.post('/users', requireAuth, async (req, res) => {
  const { first_name, age, occupation, gender, hobbies, blurb, personal_values } = req.body ?? {};
  if (req.account.kind === 'org') {
    return res.status(403).json({ error: 'Organization accounts do not have a volunteer profile.' });
  }

  if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
    return res.status(400).json({ error: 'first_name is required' });
  }
  const ageNumber = Number(age);
  if (!Number.isInteger(ageNumber) || ageNumber <= 0) {
    return res.status(400).json({ error: 'age must be a positive integer' });
  }
  // Individual matching is adults-only (master spec); the matching engine
  // also enforces this as a hard filter.
  if (ageNumber < 18) {
    return res.status(400).json({ error: 'In Good Company is for volunteers 18 and over.' });
  }
  if (!gender || typeof gender !== 'string' || !gender.trim()) {
    return res.status(400).json({ error: 'gender is required' });
  }
  // Length limits keep partner cards and the chat intro readable.
  const tooLong = (value, max) => value != null && (typeof value !== 'string' || value.trim().length > max);
  if (first_name.trim().length > 40) return res.status(400).json({ error: 'First name must be 40 characters or fewer.' });
  if (gender.trim().length > 40) return res.status(400).json({ error: 'Gender must be 40 characters or fewer.' });
  if (tooLong(occupation, 80)) return res.status(400).json({ error: 'Occupation or school must be 80 characters or fewer.' });
  if (tooLong(blurb, 300)) return res.status(400).json({ error: 'Your intro must be 300 characters or fewer.' });
  if (tooLong(personal_values, 300)) return res.status(400).json({ error: 'Your values must be 300 characters or fewer.' });
  if (hobbies != null) {
    const tags = typeof hobbies === 'string' ? hobbies.split(',').map((t) => t.trim()).filter(Boolean) : null;
    if (!tags || hobbies.length > 200 || tags.length > 5 || tags.some((t) => t.length > 30)) {
      return res.status(400).json({ error: 'List up to 5 interests, each 30 characters or fewer.' });
    }
  }
  // Occupation, interests and the intro are shown to proposed partners and
  // pasted into the chat intro, so they can't carry contact details (the
  // same rule chat enforces until both people opt in).
  for (const value of [occupation, hobbies, blurb]) {
    if (typeof value === 'string' && containsContactInfo(value)) {
      return res.status(422).json({
        error: "Please leave out phone numbers, emails and social handles — you can share them in chat once you've both opted in.",
        code: 'contact_info_blocked',
      });
    }
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
    db.prepare(`
      UPDATE users SET
        full_name = @full_name, display_name = @display_name, age = @age,
        gender = @gender, occupation = @occupation, interest_tags = @interest_tags,
        bio = @bio, personal_values = @personal_values, updated_at = datetime('now')
      WHERE account_id = @account_id
    `).run(profile);

    // Revocation-on-claim-change, eager path (Recryption §3.2 via
    // onClaimsChanged): the badge attests full_name/age source values, so
    // after the row is updated the service recomputes the claims digest and
    // revokes any badge it no longer matches — server-enforced at write
    // time, not client-trusted, and unbypassable by a client that "forgets"
    // a flag. users.verified/verification_badge are display mirrors, synced
    // here when a revocation actually happened. (The library's per-verify
    // recompute is the lazy backstop for paths that skip this route.)
    const revoked = await badgeService.onClaimsChanged(existing.id);
    if (revoked.length > 0) {
      db.prepare(`
        UPDATE users SET verified = 0, verified_at = NULL, verification_badge = NULL WHERE id = ?
      `).run(existing.id);
    }
  } else {
    db.prepare(`
      INSERT INTO users (account_id, full_name, display_name, age, gender, occupation, interest_tags, bio, personal_values)
      VALUES (@account_id, @full_name, @display_name, @age, @gender, @occupation, @interest_tags, @bio, @personal_values)
    `).run(profile);
    const created = db.prepare('SELECT id FROM users WHERE account_id = ?').get(req.account.id);
    const { referral_code_used: code } = db.prepare('SELECT referral_code_used FROM accounts WHERE id = ?').get(req.account.id);
    referrals.linkReferrer(created.id, code);
  }

  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(existing ? 200 : 201).json(ownProfile(user));
});

// Returns the full current profile for the logged-in account, so the app can
// resume onboarding where the user left off instead of always starting over.
// 404s if the profile row doesn't exist yet (quickProfile not submitted).
app.get('/users/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  if (!user) {
    return res.status(404).json({ error: 'No profile yet.' });
  }
  res.status(200).json(ownProfile(user));
});

// Onboarding steps 2-5+ (location, org-or-cause, causes, partner preferences,
// availability) all save through here — each screen sends only the fields it
// collects, and only those columns are updated. See specs/
// volunteer-pairing-app-master-prompt.md section 3.1 for the full field list.
// The options offered on mobile/screens/AvailabilityScreen.js.
const VOLUNTEERING_FREQUENCIES = ['Once a month', 'Twice a month', 'Three times a month', 'Weekly'];

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
      if (!Array.isArray(body.cause_tags) || body.cause_tags.length > 12 || !body.cause_tags.every((tag) => CAUSES.includes(tag))) {
        return res.status(400).json({ error: `cause_tags must be a list of causes from: ${CAUSES.join(', ')}` });
      }
      updates.cause_tags = JSON.stringify([...new Set(body.cause_tags)]);
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
      const [min, max] = { location_lat: [-90, 90], location_lng: [-180, 180], travel_radius_miles: [1, 100] }[field];
      if (body[field] !== null && (body[field] === '' || typeof body[field] === 'boolean' || !Number.isFinite(num) || num < min || num > max)) {
        return res.status(400).json({ error: `${field} must be a number between ${min} and ${max}, or null` });
      }
      updates[field] = body[field] === null ? null : num;
    } else if (field === 'volunteering_frequency') {
      if (!VOLUNTEERING_FREQUENCIES.includes(body[field])) {
        return res.status(400).json({ error: `volunteering_frequency must be one of: ${VOLUNTEERING_FREQUENCIES.join(', ')}` });
      }
      updates[field] = body[field];
    } else if (field === 'availability_window_start' || field === 'availability_window_end') {
      if (body[field] !== null && !isRealDate(body[field])) {
        return res.status(400).json({ error: `${field} must be a real date (YYYY-MM-DD)` });
      }
      updates[field] = body[field];
    } else if (field === 'location_city' || field === 'prospective_org_name') {
      if (body[field] !== null && (typeof body[field] !== 'string' || body[field].trim().length > 80)) {
        return res.status(400).json({ error: `${field} must be text of 80 characters or fewer` });
      }
      updates[field] = body[field] === null ? null : body[field].trim();
    } else {
      updates[field] = typeof body[field] === 'string' ? body[field].trim() : body[field];
    }
  }

  // A window, whether saved now or partly before, must run start → end.
  const current = db.prepare('SELECT availability_window_start, availability_window_end FROM users WHERE account_id = ?').get(req.account.id);
  const start = 'availability_window_start' in updates ? updates.availability_window_start : current.availability_window_start;
  const end = 'availability_window_end' in updates ? updates.availability_window_end : current.availability_window_end;
  if (('availability_window_start' in updates || 'availability_window_end' in updates) && start && end && end < start) {
    return res.status(400).json({ error: 'The end date must be on or after the start date.' });
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
  res.status(200).json(ownProfile(user));
});

// ── Identity verification routes ──
// Prototype scope per the planning decisions: manual-entry extraction (no
// scanning SDK), no selfie/face-match, no retained ID imagery anywhere.
// What persists: attestation result, the document_hashes claim, and the
// BadgeService-signed "preview" badge (badges/signed_badges + the display
// mirror on users.verification_badge).
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

// D6: the one endpoint that accepts the plaintext document fields. The
// plaintext exists only inside DuplicateDetector.checkDuplicate() (library
// guarantee: never stored, logged, or returned); what's staged for attest is
// the record the library wrote — server-computed, never client-supplied.
// Validation errors are static strings — the submitted values are never
// echoed. NOTE: checkDuplicate is claim-at-check (lookup AND record in one
// call, per the library's design) — the duplicate claim exists from this
// moment, not from attest time. Same-subject re-checks refresh rather than
// conflict.
app.post('/verification/document-check', requireAuth, requireProfile, async (req, res) => {
  if (!underDocCheckLimit(req.account.id)) {
    return res.status(429).json({ error: 'Too many document checks. Try again in an hour.', code: 'too_many_document_checks' });
  }

  const { document_type, issuing_country, document_number } = req.body ?? {};
  const fieldsInvalid =
    typeof document_type !== 'string' ||
    typeof issuing_country !== 'string' ||
    typeof document_number !== 'string';
  const staticFieldError = {
    code: 'invalid_document_fields',
    error: 'document_type, issuing_country, and document_number are required; the number must contain letters or digits, and ":" is not allowed in type or country.',
  };
  if (fieldsInvalid) {
    return res.status(400).json(staticFieldError);
  }

  const user = db.prepare('SELECT id FROM users WHERE account_id = ?').get(req.account.id);

  let result;
  try {
    result = await docDetector.checkDuplicate(
      { document_type, issuing_country, document_number },
      user.id
    );
  } catch (err) {
    if (err instanceof InvalidDocumentError) {
      // Same static message as the field guard — the library's error detail
      // is not echoed, so document values can't leak through error bodies.
      return res.status(400).json(staticFieldError);
    }
    throw err;
  }

  if (result.duplicate) {
    // The other account's identity (result.existing_subject_id) is
    // deliberately not returned to the client.
    return res.status(200).json({ duplicate: true });
  }

  // checkDuplicate recorded/refreshed this subject's claim; stage that
  // server-side record for the follow-up attest.
  const record = await docHashStore.findLatestBySubject(user.id);
  pendingDocChecks.set(req.account.id, { hmac: record.doc_hmac, expiresAt: Date.now() + PENDING_DOC_CHECK_TTL_MS });
  res.status(200).json({ duplicate: false });
});

// Orgs (and tests) verify badge signatures against this. Serves the
// KeyManager's active-key record (raw 32-byte Ed25519 public key as hex plus
// its self-verifying key_id) instead of the old SPKI PEM — the shape
// Recryption's canonical badge verification actually consumes.
app.get('/verification/public-key', async (req, res) => {
  const key = await badgeKeyManager.getActiveKey();
  if (!key) {
    return res.status(503).json({ error: 'No active signing key.' });
  }
  res.json({ key_id: key.key_id, public_key: key.public_key, status: key.status });
});

// Receives the on-device attestation (spec point 8 shape). The document hash
// comes from this account's recent document-check staging (D6) — never from
// the client. The device signature slot is stubbed at prototype stage — no
// hardware key without a dev build — so transport trust is TLS only.
app.post('/verification/attest', requireAuth, requireProfile, async (req, res) => {
  const { name_match, dob_match, doc_type_confirmed, dob_is_adult, expiry_date } = req.body ?? {};

  // The device decides adulthood from the ID's own date of birth (which never
  // leaves the device) and sends only this boolean. An explicit false is a
  // minor's document and is refused before anything is staged or issued. A
  // missing field is still accepted for older clients and the Recryption
  // suites; see the open question on closing that gap.
  if (dob_is_adult === false) {
    return res.status(400).json({
      error: 'In Good Company is for adults only, so this document can\'t be used to verify.',
      code: 'underage_document',
    });
  }

  for (const [field, value] of Object.entries({ name_match, dob_match, doc_type_confirmed })) {
    if (value !== true) {
      // Server re-checks what the device asserts; a failed local check
      // should never have been submitted, but don't trust the client.
      return res.status(400).json({ error: `Verification failed: ${field} is not true.`, code: `${field}_not_true` });
    }
  }

  // V3: expiry is actually checked, not just extracted and ignored.
  if (typeof expiry_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
    return res.status(400).json({ error: 'expiry_date must be a YYYY-MM-DD date.', code: 'invalid_expiry_date' });
  }
  if (expiry_date <= new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'This document is expired.', code: 'document_expired' });
  }

  const staged = pendingDocChecks.get(req.account.id);
  if (!staged || staged.expiresAt < Date.now()) {
    pendingDocChecks.delete(req.account.id);
    return res.status(400).json({ error: 'No recent document check. Start verification again.', code: 'no_recent_document_check' });
  }
  const doc_hmac = staged.hmac;

  const user = db.prepare('SELECT id, display_name FROM users WHERE account_id = ?').get(req.account.id);

  // V4 commit-time integrity check. Under claim-at-check the claim was
  // recorded at document-check, so the old "someone attested between check
  // and attest" race can't occur — but the staged claim must still exist in
  // document_hashes and still belong to this subject before we commit
  // verified status against it.
  const claim = await docHashStore.findByHmac(doc_hmac);
  if (!claim) {
    pendingDocChecks.delete(req.account.id);
    return res.status(400).json({ error: 'No recent document check. Start verification again.', code: 'no_recent_document_check' });
  }
  if (claim.subject_id !== user.id) {
    pendingDocChecks.delete(req.account.id);
    return res.status(409).json({ error: 'This document has already verified another account.', code: 'document_already_used' });
  }

  // Badge issuance via Recryption's BadgeService (module 3): payload built
  // and signed by the library through the Signer callback, claims digest
  // computed from the subject's current full_name/age source values, badge
  // + signed archive persisted to badges/signed_badges. The "preview"
  // labeling is part of the SIGNED claims (see badgeClaims): until a real
  // scanning SDK replaces manual entry, verified means "completed the
  // flow," not "identity confirmed" — the badge itself must never claim
  // more than the pipeline can back. D7: subject_id is users.id.
  //
  // D9: issueSuperseding, not badgeService.issue() directly — a re-attest
  // with unchanged claims (e.g. re-verifying the same document) never trips
  // the digest-mismatch revocation paths, so a bare issue() would leave the
  // previous badge valid alongside the new one. See badgeStore.js.
  const signedBadge = await issueSuperseding(
    badgeService, badgeStore,
    { subject_id: user.id, claims: badgeClaims(user) },
    badgeSigner
  );

  db.prepare(`
    UPDATE users SET
      verified = 1, verified_at = datetime('now'),
      verification_badge = @badge, updated_at = datetime('now')
    WHERE account_id = @account_id
  `).run({ badge: JSON.stringify(signedBadge), account_id: req.account.id });
  pendingDocChecks.delete(req.account.id);
  // Referral credit is earned at verification, so a duplicate-document
  // account (blocked above) can never earn a self-referral.
  referrals.creditOnVerification(user.id);

  const updated = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(200).json(ownProfile(updated));
});

// ── Prototype lifecycle routes ──
// Orgs/shifts, availability requests and matching, the pairing lifecycle,
// chat, shift day, ratings, buddies, Deeds/Premium, safety and metrics live
// in routes/ (backed by lib/). The org router is mounted first so
// /orgs/mine isn't captured by the public /orgs/:id route.
app.use(orgRoutes.router);
app.use(volunteerRoutes.router);
app.use(adminRoutes);
app.use(devRoutes);

app.use((err, req, res, next) => {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

// Async startup: Recryption is ESM-only (see backend/recryption/keyStore.js
// on the module seam), so the detector loads via dynamic import before the
// server accepts connections. Pepper validation failures (missing/weak
// DOC_PEPPER) abort startup here — the same fail-loudly behavior as the old
// top-of-file DOC_PEPPER check.
(async function main() {
  try {
    const wired = await makeDetector(db);
    docDetector = wired.detector;
    docHashStore = wired.store;
    ({ InvalidDocumentError } = await require('./recryption/keyStore').loadRecryption());

    const badges = await makeBadgeService(db);
    badgeService = badges.badgeService;
    badgeStore = badges.badgeStore;
    badgeKeyManager = badges.keyManager;
    badgeSigner = badges.signer;
    services.set({ badgeService, badgeStore });

    // One-time upgrade of pre-module-3 verified users from the old
    // hand-signed badge format to real BadgeService badges (idempotent —
    // skips anyone who already has a valid badge record).
    const upgraded = await upgradeLegacyBadges(db, badgeService, badgeSigner);
    if (upgraded > 0) {
      console.log(`[verification] upgraded ${upgraded} legacy badge(s) to BadgeService issuance`);
    }
  } catch (err) {
    console.error(`Verification startup failed: ${err.message}`);
    process.exit(1);
  }

  app.listen(port, () => {
    const ip = getLocalNetworkIp();
    console.log(`Backend running — reachable at http://${ip}:${port}`);
    if (devToolsOn()) {
      console.warn('[dev] Dev clock routes (/dev/*) are enabled for signed-in users and the admin token. Set DEV_TOOLS=off or NODE_ENV=production to disable.');
    }
  });

  // Time-based lifecycle transitions (proposal expiry, decision windows,
  // waiting caps, starters, attendance) plus a matching pass. Routes that
  // read lifecycle state also tick on demand; TICK_INTERVAL_MS=0 disables
  // the background timer (the test suites drive time explicitly).
  const tickMs = Number(process.env.TICK_INTERVAL_MS ?? 15000);
  if (tickMs > 0) {
    setInterval(() => {
      try {
        lifecycle.tick();
      } catch (err) {
        console.error('[lifecycle] tick failed:', err);
      }
    }, tickMs).unref();
  }
})();
