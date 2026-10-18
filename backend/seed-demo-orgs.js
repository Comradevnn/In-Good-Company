// Standalone script — seeds demo host organizations and their upcoming
// shifts in the San Jose / Cupertino launch market, so matching has real
// shifts to work with. Run with `node seed-demo-orgs.js` from backend/.
//
// Every org gets an org login whose email matches /^demo-org-\d+@example\.com$/
// (password "demopassword123"), so clear-demo-orgs.js can remove exactly these
// rows and nothing else. Names are fictional, marked "(demo)". Safe to
// re-run: existing demo orgs are kept and only get shifts topped up, so
// there are always about two weeks of upcoming shifts.
//
// Org verification is a seed flag here (verified = 1). demo-org-7 is left
// unverified on purpose: its shifts exist but are invisible to volunteers,
// which demonstrates the verification gate. Verify it from the admin page
// (GET /admin) to watch its shifts appear.
require('./env');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('./db');
const { zonedToUtc, localDate, addDays } = require('./lib/time');

const DEMO_PASSWORD = 'demopassword123';

// weekday: 0 = Sunday … 6 = Saturday, in the platform timezone.
const DEMO_ORGS = [
  {
    email: 'demo-org-1@example.com',
    name: 'Guadalupe Valley Food Pantry (demo)',
    description: 'Neighborhood pantry sorting, packing and handing out groceries several days a week.',
    mission_tags: ['Food banks & shelters', 'Community organizing'],
    location_label: 'Downtown San Jose, CA',
    lat: 37.3337, lng: -121.8907,
    verified: true,
    shifts: [
      { title: 'Food sorting & packing', cause_tags: ['Food banks & shelters'], weekdays: [3, 6], start: [9, 0], end: [11, 30], capacity: 8 },
      { title: 'Mobile pantry distribution', cause_tags: ['Food banks & shelters'], weekdays: [5], start: [16, 0], end: [18, 30], capacity: 6 },
    ],
  },
  {
    email: 'demo-org-2@example.com',
    name: 'West Valley Animal Haven (demo)',
    description: 'Shelter caring for dogs and cats awaiting adoption. Volunteers socialize animals and help keep kennels running.',
    mission_tags: ['Animal welfare'],
    location_label: 'West San Jose, CA',
    lat: 37.3080, lng: -121.9790,
    verified: true,
    shifts: [
      { title: 'Dog socializing', cause_tags: ['Animal welfare'], weekdays: [2, 6], start: [9, 0], end: [11, 30], capacity: 6 },
      { title: 'Cat room care', cause_tags: ['Animal welfare'], weekdays: [0, 4], start: [14, 0], end: [16, 0], capacity: 4 },
    ],
  },
  {
    email: 'demo-org-3@example.com',
    name: 'River Trail Stewards (demo)',
    description: 'Trail and creek cleanups plus native-garden care along the river park.',
    mission_tags: ['Environmental cleanups', 'Animal welfare'],
    location_label: 'Guadalupe River Park, San Jose, CA',
    lat: 37.3400, lng: -121.8950,
    verified: true,
    shifts: [
      { title: 'Trail & creek cleanup', cause_tags: ['Environmental cleanups'], weekdays: [0, 6], start: [8, 30], end: [11, 0], capacity: 10 },
    ],
  },
  {
    email: 'demo-org-4@example.com',
    name: 'Cupertino Community Kitchen (demo)',
    description: 'Cooks and serves hot meals for neighbors experiencing food insecurity or homelessness.',
    mission_tags: ['Food banks & shelters'],
    location_label: 'Cupertino, CA',
    lat: 37.3230, lng: -122.0322,
    verified: true,
    shifts: [
      { title: 'Meal prep & serving', cause_tags: ['Food banks & shelters'], weekdays: [1, 4], start: [17, 0], end: [19, 30], capacity: 6 },
    ],
  },
  {
    email: 'demo-org-5@example.com',
    name: 'Eastside Youth Mentors (demo)',
    description: 'After-school homework help and mentoring for middle schoolers.',
    mission_tags: ['Youth mentorship'],
    location_label: 'East San Jose, CA',
    lat: 37.3500, lng: -121.8400,
    verified: true,
    shifts: [
      { title: 'Homework club', cause_tags: ['Youth mentorship'], weekdays: [2, 4], start: [15, 30], end: [17, 30], capacity: 6 },
    ],
  },
  {
    email: 'demo-org-6@example.com',
    name: 'Sunrise Senior Companions (demo)',
    description: 'Visits, games and walks with older adults at a community senior center.',
    mission_tags: ['Elder care'],
    location_label: 'Willow Glen, San Jose, CA',
    lat: 37.3060, lng: -121.8990,
    verified: true,
    shifts: [
      { title: 'Afternoon companionship', cause_tags: ['Elder care'], weekdays: [0, 3], start: [13, 0], end: [15, 0], capacity: 6 },
    ],
  },
  {
    email: 'demo-org-7@example.com',
    name: 'Neighbors United SJ (demo)',
    description: 'Grassroots tenant-support and neighborhood organizing group. Not yet verified — its shifts stay hidden.',
    mission_tags: ['Community organizing'],
    location_label: 'San Jose, CA',
    lat: 37.3382, lng: -121.8863,
    verified: false,
    shifts: [
      { title: 'Door-knocking for a block meeting', cause_tags: ['Community organizing'], weekdays: [6], start: [10, 0], end: [12, 0], capacity: 8 },
    ],
  },
];

const DAYS_AHEAD = 14;

async function seed() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();
  const today = localDate(now);
  let newShifts = 0;

  for (const demo of DEMO_ORGS) {
    let account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(demo.email);
    if (!account) {
      db.prepare(`INSERT INTO accounts (email, password_hash, session_token, kind) VALUES (?, ?, ?, 'org')`)
        .run(demo.email, passwordHash, crypto.randomBytes(32).toString('hex'));
      account = db.prepare('SELECT id FROM accounts WHERE email = ?').get(demo.email);
    }
    let org = db.prepare('SELECT * FROM orgs WHERE account_id = ?').get(account.id);
    if (!org) {
      const id = crypto.randomBytes(16).toString('hex');
      db.prepare(`
        INSERT INTO orgs (id, account_id, name, description, mission_tags, location_label, location_lat, location_lng,
          verified, verified_at, waiver_kind, waiver_uploaded_at, registration_number, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'platform_default', ?, ?, ?)
      `).run(id, account.id, demo.name, demo.description, JSON.stringify(demo.mission_tags), demo.location_label, demo.lat, demo.lng,
        demo.verified ? 1 : 0, demo.verified ? now.toISOString() : null, now.toISOString(), `DEMO-EIN-${demo.email.match(/\d+/)[0]}`,
        now.toISOString());
      org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(id);
      console.log(`added ${demo.email} — ${demo.name}${demo.verified ? '' : ' (unverified)'}`);
    } else {
      console.log(`skip  ${demo.email} — already exists, topping up shifts`);
    }

    for (let offset = 1; offset <= DAYS_AHEAD; offset++) {
      const day = addDays(today, offset);
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      for (const template of demo.shifts) {
        if (!template.weekdays.includes(weekday)) continue;
        const startsAt = zonedToUtc(day, ...template.start).toISOString();
        const exists = db.prepare('SELECT 1 FROM shifts WHERE org_id = ? AND title = ? AND starts_at = ?').get(org.id, template.title, startsAt);
        if (exists) continue;
        db.prepare(`
          INSERT INTO shifts (id, org_id, title, description, cause_tags, starts_at, ends_at, location_label, location_lat, location_lng,
            capacity_total, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(crypto.randomBytes(16).toString('hex'), org.id, template.title, demo.description, JSON.stringify(template.cause_tags),
          startsAt, zonedToUtc(day, ...template.end).toISOString(), demo.location_label, demo.lat, demo.lng, template.capacity,
          now.toISOString());
        newShifts++;
      }
    }
  }
  console.log(`\n${newShifts} new shift(s) over the next ${DAYS_AHEAD} days.`);
}

seed()
  .then(() => console.log(`Done. Org logins: demo-org-N@example.com / "${DEMO_PASSWORD}".`))
  .catch((err) => {
    console.error('Seeding orgs failed:', err);
    process.exitCode = 1;
  });
