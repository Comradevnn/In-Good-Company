// Hard filters: incompatible people are never paired, whatever else lines
// up. Gender preference, age, verification (and its no-match precedence),
// safety reports (even between buddies), the monthly cap, unverified orgs,
// cause alignment, travel radius, mutual-only buddy requests, and Premium
// never jumping the queue. Own server on :3050, own throwaway database.
const crypto = require('node:crypto');
const h = require('./test-helpers');

h.useTempDb('filters');
const { check, api } = h;

async function stop(...vols) {
  for (const v of vols) await api('/requests/current/cancel', { method: 'POST', token: v.token });
}

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const pairingsBetween = (a, b) => db.prepare(`
    SELECT COUNT(*) AS n FROM pairings WHERE shift_id != 'past-shift' AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
  `).get(a.id, b.id, b.id, a.id).n;
  // A searching request written straight to the DB, for users the route
  // would (correctly) refuse — proves the engine itself also excludes them.
  const forceSearching = async (vol) => {
    db.prepare(`
      INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, status, search_deadline, created_at)
      VALUES (?, ?, 'standard', ?, ?, 15, 'searching', ?, ?)
    `).run(crypto.randomBytes(8).toString('hex'), vol.id, await h.serverDate(1), await h.serverDate(10),
      new Date(Date.now() + 4 * 86400000).toISOString(), new Date().toISOString());
  };
  // Each scenario starts from a clean slate: earlier scenarios' shifts are
  // closed and their open searches ended, so nobody is absorbed elsewhere.
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const lastReason = (vol) => db.prepare('SELECT last_reason FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(vol.id)?.last_reason;

  try {
    // ── Gender preference (mutual) ──
    const orgElder = await h.makeOrg({ mission_tags: ['Elder care'] });
    await h.makeShift(orgElder, { cause_tags: ['Elder care'], daysAhead: 3 });
    const samePrefF = await h.makeVolunteer({ name: 'Sam', gender: 'Female', gender_pref: 'same_gender_only', deeds: 5, causes: ['Elder care', 'Youth mentorship'] });
    const anyM = await h.makeVolunteer({ name: 'Mo', gender: 'Male', gender_pref: 'any', deeds: 5, causes: ['Elder care', 'Youth mentorship'] });
    await h.startLooking(samePrefF);
    await h.startLooking(anyM);
    check('same-gender-only user is never paired with another gender (either direction)', pairingsBetween(samePrefF, anyM) === 0);
    const anyF = await h.makeVolunteer({ name: 'Fay', gender: 'Female', gender_pref: 'any', deeds: 5, causes: ['Elder care', 'Youth mentorship'] });
    await h.startLooking(anyF);
    check('…but is paired once a compatible partner arrives (longest waiter first)', pairingsBetween(samePrefF, anyF) === 1);
    await stop(samePrefF, anyM, anyF);

    isolate();
    // ── Verification ──
    const orgYouth = await h.makeOrg({ mission_tags: ['Youth mentorship'] });
    await h.makeShift(orgYouth, { cause_tags: ['Youth mentorship'], daysAhead: 4 });
    const unverified = await h.makeVolunteer({ name: 'Una', verify: false, deeds: 5, causes: ['Youth mentorship', 'Community organizing'] });
    const refused = await h.startLooking(unverified);
    check('an unverified user cannot start a search (clear code)', refused.status === 409 && refused.body.code === 'verification_incomplete', refused.body);
    await forceSearching(unverified);
    const verifiedYouth = await h.makeVolunteer({ name: 'Vic', deeds: 5, causes: ['Youth mentorship', 'Community organizing'] });
    await h.startLooking(verifiedYouth);
    check('an unverified user is never anyone\'s partner, even if their search exists', pairingsBetween(unverified, verifiedYouth) === 0);
    check('verification_incomplete is the reported reason (takes precedence)', lastReason(unverified) === 'verification_incomplete', lastReason(unverified));
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE user_id = ?").run(unverified.id);

    // ── Age (18+) ──
    const signup = await api('/auth/signup', { method: 'POST', body: { email: `minor-${Date.now()}@example.com`, password: 'testpassword1' } });
    const minorProfile = await api('/users', { method: 'POST', token: signup.body.session_token, body: { first_name: 'Kid', age: 17, gender: 'Male' } });
    check('a 17-year-old cannot create a volunteer profile', minorProfile.status === 400);
    const teen = await h.makeVolunteer({ name: 'Teen', deeds: 5, causes: ['Youth mentorship', 'Community organizing'] });
    db.prepare('UPDATE users SET age = 17 WHERE id = ?').run(teen.id); // e.g. an upstream data bug
    await forceSearching(teen);
    await h.tick();
    check('an under-18 profile is never paired, even when otherwise compatible and verified', pairingsBetween(teen, verifiedYouth) === 0);
    check('…reported as ineligible', lastReason(teen) === 'ineligible_age', lastReason(teen));
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE user_id = ?").run(teen.id);
    await stop(verifiedYouth);

    isolate();
    // ── Safety report blocks pairing permanently, buddies included ──
    const orgAnimal = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    await h.makeShift(orgAnimal, { cause_tags: ['Animal welfare'], daysAhead: 5 });
    const reporter = await h.makeVolunteer({ name: 'Rae', deeds: 5 });
    const reported = await h.makeVolunteer({ name: 'Rex', deeds: 5 });
    const [low, high] = [reporter.id, reported.id].sort();
    db.prepare("INSERT INTO buddies (user_low_id, user_high_id, status, created_at) VALUES (?, ?, 'active', ?)").run(low, high, new Date().toISOString());
    // A report by id needs a pairing the two once shared (a past, ended one here).
    db.prepare(`INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status) VALUES (?, ?, ?, 'past-shift', 'completed')`)
      .run(crypto.randomBytes(8).toString('hex'), reporter.id, reported.id);
    const filed = await api('/safety/reports', { method: 'POST', token: reporter.token, body: { category: 'made_me_uncomfortable', reported_user_id: reported.id } });
    check('the report about a past partner is accepted', filed.status === 201, filed.body);
    db.prepare("UPDATE buddies SET status = 'active' WHERE user_low_id = ? AND user_high_id = ?").run(low, high); // even if still buddies
    await h.startLooking(reporter, { extra: { buddy_user_id: reported.id } });
    await h.startLooking(reported, { extra: { buddy_user_id: reporter.id } });
    check('a safety report blocks pairing even between mutual buddies who both asked', pairingsBetween(reporter, reported) === 0);
    await stop(reporter, reported);
    await h.startLooking(reporter);
    await h.startLooking(reported);
    check('…and in ordinary matching too', pairingsBetween(reporter, reported) === 0);
    await stop(reporter, reported);

    isolate();
    // ── Monthly cap ──
    const capped = await h.makeVolunteer({ name: 'Cap', deeds: 5 });
    db.prepare("UPDATE accounts SET created_at = datetime('now', '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)").run(capped.id);
    const anyShift = db.prepare('SELECT id FROM shifts LIMIT 1').get().id;
    const { monthKey } = require('./lib/time');
    for (let i = 0; i < 2; i++) {
      db.prepare(`
        INSERT INTO bookings (id, user_id, shift_id, kind, status, cap_month, created_at) VALUES (?, ?, ?, 'paired', 'attended', ?, ?)
      `).run(crypto.randomBytes(8).toString('hex'), capped.id, anyShift, monthKey(new Date(await h.serverNow())), new Date().toISOString());
    }
    const capRefused = await h.startLooking(capped);
    check('a free user at the monthly cap cannot start a search', capRefused.status === 409 && capRefused.body.code === 'monthly_cap_reached', capRefused.body);
    await forceSearching(capped);
    const capPartner = await h.makeVolunteer({ name: 'Cara', deeds: 5 });
    await h.startLooking(capPartner);
    check('a capped user is excluded from the pool even with a search open', pairingsBetween(capped, capPartner) === 0);
    check('…with the distinct monthly_cap_reached reason (for an upgrade prompt)', lastReason(capped) === 'monthly_cap_reached', lastReason(capped));
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE user_id = ?").run(capped.id);
    await stop(capPartner);

    isolate();
    // ── Unverified org: perfect alignment, still never selected ──
    const hiddenOrg = await h.makeOrg({ mission_tags: ['Environmental cleanups'], verified: false });
    const hiddenShift = await h.makeShift(hiddenOrg, { cause_tags: ['Environmental cleanups'], daysAhead: 3 });
    const env1 = await h.makeVolunteer({ deeds: 5, causes: ['Environmental cleanups', 'Elder care'] });
    const env2 = await h.makeVolunteer({ deeds: 5, causes: ['Environmental cleanups', 'Elder care'] });
    await h.startLooking(env1);
    await h.startLooking(env2);
    check("an unverified org's shift is never matched into", db.prepare('SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ?').get(hiddenShift.id).n === 0);
    await api(`/admin/orgs/${hiddenOrg.id}/verify`, { method: 'POST', admin: true, body: { verified: true } });
    check('once verified, the same two are matched onto it', db.prepare('SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ?').get(hiddenShift.id).n === 1);
    await stop(env1, env2);

    isolate();
    // ── Cause alignment: org-mission match alone isn't enough ──
    const orgMixed = await h.makeOrg({ mission_tags: ['Community organizing', 'Youth mentorship'] });
    const youthOnly = await h.makeShift(orgMixed, { cause_tags: ['Youth mentorship'], daysAhead: 6 });
    const org1 = await h.makeVolunteer({ deeds: 5, causes: ['Community organizing', 'Elder care'] });
    const org2 = await h.makeVolunteer({ deeds: 5, causes: ['Community organizing', 'Elder care'] });
    await h.startLooking(org1);
    await h.startLooking(org2);
    check("users matching only the org's mission (not the shift's cause) aren't placed on it",
      db.prepare('SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ?').get(youthOnly.id).n === 0);
    await stop(org1, org2);

    isolate();
    // ── Travel radius ──
    const farOrg = await h.makeOrg({ mission_tags: ['Food banks & shelters'], lat: 37.4419, lng: -122.143 }); // ~17 mi from downtown SJ
    await h.makeShift(farOrg, { cause_tags: ['Food banks & shelters'], daysAhead: 3, lat: 37.4419, lng: -122.143 });
    const near1 = await h.makeVolunteer({ deeds: 5, radius: 5, lat: 37.3382, lng: -121.8863, causes: ['Food banks & shelters', 'Elder care'] });
    const near2 = await h.makeVolunteer({ deeds: 5, radius: 5, lat: 37.3382, lng: -121.8863, causes: ['Food banks & shelters', 'Elder care'] });
    await h.startLooking(near1, { extra: { travel_radius_miles: 5 } });
    const r2 = await h.startLooking(near2, { extra: { travel_radius_miles: 5 } });
    check('a shift outside both travel radii is never matched', pairingsBetween(near1, near2) === 0 && r2.body.reason === 'no_shift_in_shared_causes', r2.body.reason);
    const widen = r2.body.alternatives.find((a) => a.type === 'widen_radius');
    check('the waiting screen offers widening the radius to a specific distance', widen && widen.travel_radius_miles >= 15, r2.body.alternatives);
    await api('/requests/current/adjust', { method: 'POST', token: near1.token, body: { travel_radius_miles: 20 } });
    const adj = await api('/requests/current/adjust', { method: 'POST', token: near2.token, body: { travel_radius_miles: 20 } });
    check('after both widen their radius, they are matched', adj.body.request.status === 'proposed', adj.body.request);

    isolate();
    // ── Buddy requests must be mutual ──
    await h.makeShift(orgAnimal, { cause_tags: ['Animal welfare'], daysAhead: 6 });
    const bud1 = await h.makeVolunteer({ deeds: 5, causes: ['Animal welfare', 'Youth mentorship'] });
    const bud2 = await h.makeVolunteer({ deeds: 5, causes: ['Animal welfare', 'Youth mentorship'] });
    const [bl, bh] = [bud1.id, bud2.id].sort();
    db.prepare("INSERT INTO buddies (user_low_id, user_high_id, status, created_at) VALUES (?, ?, 'active', ?)").run(bl, bh, new Date().toISOString());
    await h.startLooking(bud1, { extra: { buddy_user_id: bud2.id } });
    await h.startLooking(bud2); // open to anyone, didn't ask for bud1 this time
    check('a one-sided buddy request does not force the other buddy into a pairing', pairingsBetween(bud1, bud2) === 0);
    const stranger = await h.makeVolunteer({ deeds: 5, causes: ['Animal welfare', 'Youth mentorship'] });
    await h.startLooking(stranger);
    check('the one who asked for a buddy is not paired with a stranger instead', pairingsBetween(bud1, stranger) === 0);
    check('the buddy who opened up is matched with the stranger', pairingsBetween(bud2, stranger) === 1);
    await stop(bud1);

    isolate();
    // ── Premium never jumps the queue ──
    const orgQ = await h.makeOrg({ mission_tags: ['Elder care'] });
    await h.makeShift(orgQ, { cause_tags: ['Elder care'], daysAhead: 8, capacity: 2 });
    const freeEarly = await h.makeVolunteer({ name: 'Early', deeds: 5, causes: ['Elder care', 'Community organizing'], gender: 'Male' });
    db.prepare("UPDATE accounts SET created_at = datetime('now', '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)").run(freeEarly.id);
    await h.startLooking(freeEarly);
    const premiumLate = await h.makeVolunteer({ name: 'Late', deeds: 5, causes: ['Elder care', 'Community organizing'], gender: 'Male', gender_pref: 'same_gender_only' });
    await api('/premium/subscribe', { method: 'POST', token: premiumLate.token, body: { plan: 'annual' } });
    // premiumLate only accepts men; freeEarly is a man too — make them
    // incompatible with each other so both stay waiting for a third person.
    db.prepare("UPDATE users SET gender = 'Female' WHERE id = ?").run(premiumLate.id);
    await h.startLooking(premiumLate);
    const third = await h.makeVolunteer({ name: 'Third', deeds: 5, causes: ['Elder care', 'Community organizing'], gender: 'Female' });
    await h.startLooking(third);
    check('a later Premium searcher does not beat an earlier free searcher to the same partner',
      pairingsBetween(third, freeEarly) === 1 && pairingsBetween(third, premiumLate) === 0);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
