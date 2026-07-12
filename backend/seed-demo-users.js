// Standalone script — inserts fake, fully-onboarded, verified demo users
// directly into the database, for exercising backend/matching/engine.js by
// hand without going through signup/onboarding/verification in the app
// every time. Not an API route; run with `node seed-demo-users.js`.
//
// Every demo account uses an @example.com address matching /^demo-\d+@/, so
// clear-demo-users.js can delete exactly these rows and nothing else. Safe
// to re-run — existing demo-N@example.com rows are skipped, not duplicated.
// All demo accounts share the password "demopassword123" if you want to log
// in as one through the app itself.
//
// Cause-tag spread (see backend/matching/adjacency.js) is deliberate:
//   demo-1 + demo-2  — same cause (Animal welfare), opposite genders,
//                      gender_pref 'any' on both — exact-match pair
//                      (alignment score 1.0), demonstrates a clean match.
//   demo-3           — Environmental cleanups (adjacent to Animal welfare)
//                      — demonstrates the close-match (0.5) scoring path if
//                      matched against demo-1/demo-2's shift.
//   demo-4 + demo-5  — same cause (Elder care, no adjacency, unique to this
//                      pair), but demo-4 requires a same-gender partner and
//                      demo-5 is the wrong gender — deliberately blocked by
//                      the Step 1a gender_pref hard filter despite sharing
//                      a cause exactly.
//   demo-6           — Youth mentorship (no adjacency, no one else has it)
//                      — deliberately incompatible via unrelated causes,
//                      guaranteed "no_compatible_partner_found".
//
// Real outcomes when you actually call POST /matching/run depend on which
// account you run it as and in what order (this build has no ranking — see
// engine.js — so the first valid candidate wins). The groupings above are
// what SHOULD pair off if you run them in account order; running out of
// order is still a legitimate demo of that exact "first-candidate-wins"
// simplification.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');

const BCRYPT_ROUNDS = 10;
const DEMO_PASSWORD = 'demopassword123';

// Same key file backend/index.js uses, so these badges verify against the
// public key the running server actually serves at GET /verification/public-key.
const KEYS_DIR = path.join(__dirname, 'keys');
const BADGE_KEY_PATH = path.join(KEYS_DIR, 'badge-signing-key.pem');

function loadOrCreateBadgeKey() {
  if (!fs.existsSync(BADGE_KEY_PATH)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(BADGE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  return crypto.createPrivateKey(fs.readFileSync(BADGE_KEY_PATH));
}

require('./env'); // loads backend/.env, same as index.js
const { normalizeDocumentIdentity, docHmacHex } = require('./docIdentity');

const DOC_PEPPER = process.env.DOC_PEPPER;
if (!DOC_PEPPER) {
  console.error('DOC_PEPPER is not set. Add DOC_PEPPER=<secret> to backend/.env before seeding, so demo doc_hmacs match what the running server computes.');
  process.exit(1);
}

function signBadge(privateKey, userId, displayName) {
  const payload = {
    user_id: userId,
    display_name: displayName,
    verified: true,
    status: 'preview',
    issued_at: new Date().toISOString(),
  };
  const payloadJson = JSON.stringify(payload);
  const signature = crypto.sign(null, Buffer.from(payloadJson), privateKey).toString('base64');
  return JSON.stringify({ payload, signature });
}

const DEMO_USERS = [
  {
    email: 'demo-1@example.com',
    first_name: 'Jordan',
    age: 26,
    gender: 'Female',
    occupation: 'Product designer',
    cause_tags: ['Animal welfare'],
    gender_pref: 'any',
    doc_number: 'DEMO-DOC-1',
    document_type: 'drivers_license',
    issuing_country: 'US',
  },
  {
    email: 'demo-2@example.com',
    first_name: 'Casey',
    age: 29,
    gender: 'Male',
    occupation: 'Nurse',
    cause_tags: ['Animal welfare'],
    gender_pref: 'any',
    doc_number: 'DEMO-DOC-2',
    document_type: 'drivers_license',
    issuing_country: 'US',
  },
  {
    email: 'demo-3@example.com',
    first_name: 'Riley',
    age: 24,
    gender: 'Non-binary',
    occupation: 'Grad student',
    cause_tags: ['Environmental cleanups'],
    gender_pref: 'any',
    doc_number: 'DEMO-DOC-3',
    document_type: 'passport',
    issuing_country: 'US',
  },
  {
    email: 'demo-4@example.com',
    first_name: 'Morgan',
    age: 33,
    gender: 'Female',
    occupation: 'Teacher',
    cause_tags: ['Elder care'],
    gender_pref: 'same_gender_only', // deliberately incompatible with demo-5
    doc_number: 'DEMO-DOC-4',
    document_type: 'state_id',
    issuing_country: 'US',
  },
  {
    email: 'demo-5@example.com',
    first_name: 'Drew',
    age: 30,
    gender: 'Male',
    occupation: 'Accountant',
    cause_tags: ['Elder care'], // same cause as demo-4, blocked by gender_pref
    gender_pref: 'any',
    doc_number: 'DEMO-DOC-5',
    document_type: 'drivers_license',
    issuing_country: 'US',
  },
  {
    email: 'demo-6@example.com',
    first_name: 'Alex',
    age: 40,
    gender: 'Non-binary',
    occupation: 'Freelance writer',
    cause_tags: ['Youth mentorship'], // no adjacency, unique in this set
    gender_pref: 'any',
    doc_number: 'DEMO-DOC-6',
    document_type: 'passport',
    issuing_country: 'US',
  },
];

async function seed() {
  const privateKey = loadOrCreateBadgeKey();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  for (const demo of DEMO_USERS) {
    const existingAccount = db.prepare('SELECT id FROM accounts WHERE email = ?').get(demo.email);
    if (existingAccount) {
      console.log(`skip  ${demo.email} — already exists`);
      continue;
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    db.prepare(`
      INSERT INTO accounts (email, password_hash, session_token)
      VALUES (?, ?, ?)
    `).run(demo.email, passwordHash, sessionToken);
    const account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(demo.email);

    // Same normalized preimage as POST /verification/document-check (D6), so
    // a live duplicate check against a seeded document actually matches.
    const docHmac = docHmacHex(DOC_PEPPER, normalizeDocumentIdentity({
      document_type: demo.document_type,
      issuing_country: demo.issuing_country,
      document_number: demo.doc_number,
    }));

    const userFields = {
      account_id: account.id,
      full_name: demo.first_name,
      display_name: demo.first_name,
      age: demo.age,
      gender: demo.gender,
      occupation: demo.occupation,
      location_city: 'San Jose, CA', // display-only; no lat/lng, so the
      // travel-radius gate in passesShiftGate() is skipped rather than
      // possibly blocking a demo pairing on distance.
      cause_tags: JSON.stringify(demo.cause_tags),
      interest_tags: JSON.stringify(['hiking', 'trivia nights']),
      personal_values: 'Showing up consistently for people and causes I care about.',
      bio: 'Demo account seeded by backend/seed-demo-users.js.',
      gender_pref: demo.gender_pref,
      seeking: 'open',
      partner_prefs_confirmed: 1,
      volunteering_frequency: 'Twice a month',
      availability_window_start: '2026-07-11',
      availability_window_end: '2026-07-18',
      travel_radius_miles: 15,
      verified: 1,
      doc_hmac: docHmac,
      // At least 5 (the /matching/run gate) plus headroom to demo a back-out
      // (which forfeits 5) followed by a fresh match without re-seeding.
      deeds_balance: 10,
    };

    db.prepare(`
      INSERT INTO users (
        account_id, full_name, display_name, age, gender, occupation,
        location_city, cause_tags, interest_tags, personal_values, bio,
        gender_pref, seeking, partner_prefs_confirmed, volunteering_frequency,
        availability_window_start, availability_window_end, travel_radius_miles,
        verified, verified_at, doc_hmac, verification_badge, deeds_balance
      ) VALUES (
        @account_id, @full_name, @display_name, @age, @gender, @occupation,
        @location_city, @cause_tags, @interest_tags, @personal_values, @bio,
        @gender_pref, @seeking, @partner_prefs_confirmed, @volunteering_frequency,
        @availability_window_start, @availability_window_end, @travel_radius_miles,
        @verified, datetime('now'), @doc_hmac, @verification_badge, @deeds_balance
      )
    `).run({
      ...userFields,
      verification_badge: signBadge(privateKey, account.id, demo.first_name),
    });

    console.log(`added ${demo.email} — ${demo.first_name}, ${demo.age}, ${demo.gender}, gender_pref=${demo.gender_pref}, causes=${demo.cause_tags.join('/')}`);
  }
}

seed()
  .then(() => console.log(`\nDone. Log in as any demo-N@example.com with password "${DEMO_PASSWORD}".`))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  });
