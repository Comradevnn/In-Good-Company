const os = require('node:os');
const express = require('express');
const db = require('./db');

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

const insertUser = db.prepare(`
  INSERT INTO users (full_name, display_name, age, gender, occupation, interest_tags, bio)
  VALUES (@full_name, @display_name, @age, @gender, @occupation, @interest_tags, @bio)
`);

// Onboarding step 1 ("quickProfile" in specs/plotline.html): first name, age,
// occupation/school, gender, hobbies, and the intro blurb. Every other users
// column is left to the schema's own defaults (see backend/db/schema.sql).
app.post('/users', (req, res) => {
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

  const result = insertUser.run({
    full_name: first_name.trim(),
    display_name: first_name.trim(),
    age: ageNumber,
    gender: gender.trim(),
    occupation: typeof occupation === 'string' ? occupation.trim() : null,
    interest_tags: JSON.stringify(interestTags),
    bio: typeof blurb === 'string' ? blurb.trim() : null,
  });

  const user = db.prepare('SELECT * FROM users WHERE rowid = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

app.listen(port, () => {
  const ip = getLocalNetworkIp();
  console.log(`Backend running — reachable at http://${ip}:${port}`);
});
