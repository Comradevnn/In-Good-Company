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

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');

const BCRYPT_ROUNDS = 10;
const DEMO_PASSWORD = 'demopassword123';

require('./env'); // loads backend/.env, same as index.js
// Document claims go through Recryption's DuplicateDetector (integration
// module 2) and badges through BadgeService (module 3) — the exact same
// code paths as live verification, so seeded state is indistinguishable
// from state produced through the routes. Per decision D7 (see
// recryption/badgeStore.js), badges are issued for users.id — this seeder
// previously signed account_id, which module 3 fixed.
const { makeDetector } = require('./recryption/hashStore');
const { makeBadgeService, badgeClaims } = require('./recryption/badgeStore');

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
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  // Throws with a clear message if DOC_PEPPER is missing/weak — same
  // fail-loudly startup behavior as index.js.
  const { detector } = await makeDetector(db);
  const { badgeService, signer } = await makeBadgeService(db);

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
        verified, verified_at, deeds_balance
      ) VALUES (
        @account_id, @full_name, @display_name, @age, @gender, @occupation,
        @location_city, @cause_tags, @interest_tags, @personal_values, @bio,
        @gender_pref, @seeking, @partner_prefs_confirmed, @volunteering_frequency,
        @availability_window_start, @availability_window_end, @travel_radius_miles,
        @verified, datetime('now'), @deeds_balance
      )
    `).run(userFields);
    const user = db.prepare('SELECT id, display_name FROM users WHERE account_id = ?').get(account.id);

    // Claim the demo document through the detector — identical write path to
    // a live document-check.
    const result = await detector.checkDuplicate(
      {
        document_type: demo.document_type,
        issuing_country: demo.issuing_country,
        document_number: demo.doc_number,
      },
      user.id
    );
    if (result.duplicate) {
      throw new Error(`demo document for ${demo.email} is already claimed by another account — run clear-demo-users.js first?`);
    }

    // Issue the badge through BadgeService — same path as a live attest
    // (D7: subject is users.id) — and mirror it for display like attest does.
    const signedBadge = await badgeService.issue(
      { subject_id: user.id, claims: badgeClaims(user) },
      signer
    );
    db.prepare('UPDATE users SET verification_badge = ? WHERE id = ?').run(JSON.stringify(signedBadge), user.id);

    console.log(`added ${demo.email} — ${demo.first_name}, ${demo.age}, ${demo.gender}, gender_pref=${demo.gender_pref}, causes=${demo.cause_tags.join('/')}`);
  }
}

seed()
  .then(() => console.log(`\nDone. Log in as any demo-N@example.com with password "${DEMO_PASSWORD}".`))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  });
