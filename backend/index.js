const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');

const BCRYPT_ROUNDS = 10;

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

  const existing = db.prepare('SELECT id FROM users WHERE account_id = ?').get(req.account.id);
  if (existing) {
    db.prepare(`
      UPDATE users SET
        full_name = @full_name, display_name = @display_name, age = @age,
        gender = @gender, occupation = @occupation, interest_tags = @interest_tags,
        bio = @bio, personal_values = @personal_values, updated_at = datetime('now')
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

app.listen(port, () => {
  const ip = getLocalNetworkIp();
  console.log(`Backend running — reachable at http://${ip}:${port}`);
});
