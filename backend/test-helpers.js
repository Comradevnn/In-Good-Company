// Shared harness for the lifecycle test suites (test-*.js other than the
// Recryption ones). Each suite runs against its OWN throwaway SQLite file
// (DB_PATH) and its own server on port 3050, so matching runs can never
// touch — or pair with — accounts in the shared dev database. The file is
// deleted at the end, which is how these suites clean up their own rows.
//
// Usage: call useTempDb('<suite>') BEFORE requiring ./db anywhere.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BASE = 'http://localhost:3050';
const ADMIN_TOKEN = 'test-admin-token-1234';
let dbFile = null;

function useTempDb(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `igc-${name}-`));
  dbFile = path.join(dir, 'app.db');
  process.env.DB_PATH = dbFile;
  process.env.MATCHING_LOG = 'off';
  return dbFile;
}

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}

async function startServer(extraEnv = {}) {
  const server = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: '3050', DB_PATH: dbFile, TICK_INTERVAL_MS: '0', ADMIN_TOKEN, MATCHING_LOG: 'off', RATE_LIMIT: 'off', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await fetch(`${BASE}/hello`).then((r) => r.ok).catch(() => false)) return { server, log: () => log };
  }
  server.kill();
  throw new Error(`server never came up on 3050 (is something else using the port?). log:\n${log}`);
}

function cleanup(server) {
  if (server) server.kill();
  if (dbFile) fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
}

async function api(pathname, { method = 'GET', token, body, admin } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(admin ? { 'X-Admin-Token': ADMIN_TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function serverNow() {
  return Date.parse((await api('/dev/clock', { admin: true })).body.now);
}

async function advance({ hours = 0, days = 0, minutes = 0, to } = {}) {
  return (await api('/dev/clock/advance', { method: 'POST', admin: true, body: to ? { to } : { hours, days, minutes } })).body;
}

async function tick() {
  return (await api('/dev/tick', { method: 'POST', admin: true })).body;
}

// YYYY-MM-DD in the platform timezone, offset from the server's "now".
async function serverDate(offsetDays = 0) {
  const { localDate, addDays } = require('./lib/time');
  return addDays(localDate(new Date(await serverNow())), offsetDays);
}

let seq = 0;
const runId = Date.now().toString(36);

// A fully onboarded, ID-verified volunteer, created through the real routes.
async function makeVolunteer(opts = {}) {
  seq++;
  const email = `${opts.prefix ?? 'vol'}-${runId}-${seq}@example.com`;
  const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'testpassword1', referral_code: opts.referral_code } });
  if (signup.status !== 201) throw new Error(`signup failed: ${JSON.stringify(signup.body)}`);
  const token = signup.body.session_token;
  const profile = await api('/users', {
    method: 'POST', token,
    body: { first_name: opts.name ?? `Vol${seq}`, age: opts.age ?? 27, gender: opts.gender ?? 'Female', occupation: opts.occupation ?? 'Designer', hobbies: opts.hobbies ?? 'hiking, board games', blurb: 'Here to help.' },
  });
  if (profile.status !== 201) throw new Error(`profile failed: ${JSON.stringify(profile.body)}`);
  await api('/users/me', {
    method: 'PATCH', token,
    body: {
      location_city: 'San Jose, CA',
      ...(opts.lat != null ? { location_lat: opts.lat, location_lng: opts.lng } : {}),
      cause_tags: opts.causes ?? ['Animal welfare', 'Environmental cleanups'],
      gender_pref: opts.gender_pref ?? 'any',
      seeking: 'friendship_only',
      travel_radius_miles: opts.radius ?? 15,
      volunteering_frequency: 'Twice a month',
      availability_window_start: await serverDate(1),
      availability_window_end: await serverDate(10),
    },
  });
  if (opts.verify !== false) {
    await api('/verification/document-check', { method: 'POST', token, body: { document_type: 'passport', issuing_country: 'US', document_number: opts.doc ?? `DOC${runId}${seq}` } });
    const attest = await api('/verification/attest', { method: 'POST', token, body: { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2035-01-01' } });
    if (attest.status !== 200) throw new Error(`attest failed: ${JSON.stringify(attest.body)}`);
  }
  if (opts.deeds) await api('/deeds/purchase', { method: 'POST', token, body: { deeds: opts.deeds } });
  const me = await api('/users/me', { token });
  return { token, email, id: me.body.id, name: me.body.display_name };
}

// An org (verified by default via the admin route) with a default waiver.
async function makeOrg(opts = {}) {
  seq++;
  const email = `org-${runId}-${seq}@example.com`;
  const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'testpassword1', kind: 'org' } });
  const token = signup.body.session_token;
  const created = await api('/orgs', {
    method: 'POST', token,
    body: {
      name: opts.name ?? `Test Org ${seq}`,
      mission_tags: opts.mission_tags ?? ['Animal welfare'],
      location_label: 'San Jose, CA',
      location_lat: opts.lat ?? 37.3382,
      location_lng: opts.lng ?? -121.8863,
      registration_number: `EIN-${seq}`,
    },
  });
  if (created.status !== 201) throw new Error(`org create failed: ${JSON.stringify(created.body)}`);
  await api('/orgs/mine/waiver', { method: 'POST', token, body: { use_default: true } });
  if (opts.verified !== false) await api(`/admin/orgs/${created.body.id}/verify`, { method: 'POST', admin: true, body: { verified: true } });
  return { token, id: created.body.id, name: created.body.name };
}

async function makeShift(org, opts = {}) {
  const res = await api('/orgs/mine/shifts', {
    method: 'POST', token: org.token,
    body: {
      title: opts.title ?? 'Test shift',
      cause_tags: opts.cause_tags ?? ['Animal welfare'],
      date: opts.date ?? await serverDate(opts.daysAhead ?? 3),
      start_time: opts.start_time ?? '09:00',
      end_time: opts.end_time ?? '11:30',
      capacity: opts.capacity ?? 6,
      location_label: 'San Jose, CA',
      ...(opts.lat != null ? { location_lat: opts.lat, location_lng: opts.lng } : {}),
    },
  });
  if (res.status !== 201) throw new Error(`shift create failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function startLooking(vol, opts = {}) {
  return api('/requests', {
    method: 'POST', token: vol.token,
    // Lifecycle suites default to "anyone" so they aren't timing-dependent;
    // the match bar itself is covered in test-match-assign/test-match-ranking.
    body: { window_start: opts.window_start ?? await serverDate(1), window_end: opts.window_end ?? await serverDate(10), match_preference: opts.preference ?? 'anyone', ...opts.extra },
  });
}

async function home(vol) {
  return (await api('/me/home', { token: vol.token })).body;
}

async function proposalFor(vol) {
  const h = await home(vol);
  return h.actions.find((a) => a.type === 'proposal' || a.type === 'awaiting_partner')?.pairing_id ?? null;
}

async function confirmPairing(vol, pairingId) {
  return api(`/pairings/${pairingId}/confirm`, { method: 'POST', token: vol.token, body: { safety_notice_ack: true } });
}

function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

module.exports = {
  BASE, ADMIN_TOKEN, useTempDb, check, startServer, cleanup, api, serverNow, advance, tick, serverDate,
  makeVolunteer, makeOrg, makeShift, startLooking, home, proposalFor, confirmPairing, summary,
};
