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
// occupation/school, gender, hobbies, and the intro blurb, saved against the
// logged-in account. Creates the profile row on first submit, updates it on
// resubmit. Every other users column is left to the schema's own defaults
// (see backend/db/schema.sql).
app.post('/users', requireAuth, (req, res) => {
  const { first_name, age, occupation, gender, hobbies, blurb } = req.body ?? {};

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
  };

  const existing = db.prepare('SELECT id FROM users WHERE account_id = ?').get(req.account.id);
  if (existing) {
    db.prepare(`
      UPDATE users SET
        full_name = @full_name, display_name = @display_name, age = @age,
        gender = @gender, occupation = @occupation, interest_tags = @interest_tags,
        bio = @bio, updated_at = datetime('now')
      WHERE account_id = @account_id
    `).run(profile);
  } else {
    db.prepare(`
      INSERT INTO users (account_id, full_name, display_name, age, gender, occupation, interest_tags, bio)
      VALUES (@account_id, @full_name, @display_name, @age, @gender, @occupation, @interest_tags, @bio)
    `).run(profile);
  }

  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  res.status(existing ? 200 : 201).json(user);
});

app.listen(port, () => {
  const ip = getLocalNetworkIp();
  console.log(`Backend running — reachable at http://${ip}:${port}`);
});
