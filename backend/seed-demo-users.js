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
// Matching now runs against the real shifts seeded by seed-demo-orgs.js
// (run that first). Demo users carry a range of causes and partner
// preferences so the hard filters have something to do — demo-4 only
// accepts a same-gender partner, so they can't pair with demo-5 despite
// sharing causes.
//
// By default demo users are NOT searching for a match, so they don't pair
// off with each other before you get a chance to match with one. Pass
// --searching to also open a search for each of them (today+1 .. today+10);
// compatible demo users then pair with each other on the next matching pass,
// and the rest stay available as partners for a real account.

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const deeds = require('./lib/deeds');
const { localDate, addDays } = require('./lib/time');

const BCRYPT_ROUNDS = 10;
const SEARCHING = process.argv.includes('--searching');
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
    cause_tags: ['Animal welfare', 'Environmental cleanups'],
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
    cause_tags: ['Animal welfare', 'Environmental cleanups'],
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
    cause_tags: ['Environmental cleanups', 'Food banks & shelters'],
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
    cause_tags: ['Elder care', 'Environmental cleanups'],
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
    cause_tags: ['Elder care', 'Environmental cleanups'], // same causes as demo-4, blocked by gender_pref
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
    cause_tags: ['Youth mentorship', 'Community organizing'], // Youth mentorship is unique in this set; see header comment
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
      availability_window_start: addDays(localDate(new Date()), 1),
      availability_window_end: addDays(localDate(new Date()), 10),
      travel_radius_miles: 15,
      verified: 1,
    };

    db.prepare(`
      INSERT INTO users (
        account_id, full_name, display_name, age, gender, occupation,
        location_city, cause_tags, interest_tags, personal_values, bio,
        gender_pref, seeking, partner_prefs_confirmed, volunteering_frequency,
        availability_window_start, availability_window_end, travel_radius_miles,
        verified, verified_at
      ) VALUES (
        @account_id, @full_name, @display_name, @age, @gender, @occupation,
        @location_city, @cause_tags, @interest_tags, @personal_values, @bio,
        @gender_pref, @seeking, @partner_prefs_confirmed, @volunteering_frequency,
        @availability_window_start, @availability_window_end, @travel_radius_miles,
        @verified, datetime('now')
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

    // Deeds through the ledger (a mock purchase), enough to confirm a shift
    // and still demo a forfeiting back-out without re-seeding.
    deeds.credit(user.id, 'purchased', 10, 'purchase', { mock_payment: true, seed: true });

    console.log(`added ${demo.email} — ${demo.first_name}, ${demo.age}, ${demo.gender}, gender_pref=${demo.gender_pref}, causes=${demo.cause_tags.join('/')}`);
  }

  if (SEARCHING) {
    for (const demo of DEMO_USERS) {
      const user = db.prepare('SELECT u.* FROM users u JOIN accounts a ON a.id = u.account_id WHERE a.email = ?').get(demo.email);
      const open = db.prepare("SELECT 1 FROM availability_requests WHERE user_id = ? AND status IN ('searching', 'proposed')").get(user.id);
      if (open) continue;
      const now = new Date();
      db.prepare(`
        INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, status, search_deadline, created_at)
        VALUES (?, ?, 'standard', ?, ?, ?, 'searching', ?, ?)
      `).run(crypto.randomBytes(16).toString('hex'), user.id, user.availability_window_start, user.availability_window_end,
        user.travel_radius_miles, new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString(), now.toISOString());
      console.log(`search opened for ${demo.email}`);
    }
    console.log('Demo searches are matched on the backend\'s next matching pass (within ~15s while it runs).');
  }
}

seed()
  .then(() => console.log(`\nDone. Log in as any demo-N@example.com with password "${DEMO_PASSWORD}".`))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  });
