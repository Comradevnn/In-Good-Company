// Shift capacity can never be overbooked: concurrent searches, concurrent
// confirms, concurrent solo RSVPs, matching runs from several processes at
// once, and the boundary cases (one spot left, odd capacity). Own server on
// :3050 and own throwaway database (test-helpers.js).
const { spawn } = require('node:child_process');
const h = require('./test-helpers');

h.useTempDb('capacity');
const { check, api } = h;

function shiftRow(db, id) {
  return db.prepare('SELECT capacity_total, capacity_booked FROM shifts WHERE id = ?').get(id);
}
function liveBookings(db, shiftId) {
  return db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE shift_id = ? AND status IN ('proposed', 'confirmed')").get(shiftId).n;
}

async function stopAll(vols) {
  for (const v of vols) await api('/requests/current/cancel', { method: 'POST', token: v.token });
}

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  try {
    // ── 1. Ten people search at once for a 4-spot shift ──
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const shift = await h.makeShift(org, { capacity: 4, daysAhead: 3 });
    const crowd = [];
    for (let i = 0; i < 10; i++) crowd.push(await h.makeVolunteer({ name: `Crowd${i}`, deeds: 5, causes: ['Animal welfare', 'Elder care'] }));
    await Promise.all(crowd.map((v) => h.startLooking(v)));
    const pairings = db.prepare("SELECT * FROM pairings WHERE shift_id = ? AND status = 'proposed'").all(shift.id);
    check('10 concurrent searches on a 4-spot shift → exactly 2 proposals', pairings.length === 2, pairings.length);
    check('capacity counter = 4 of 4, never above', shiftRow(db, shift.id).capacity_booked === 4);
    check('live bookings on the shift match the counter', liveBookings(db, shift.id) === 4);
    const waiting = (await Promise.all(crowd.map((v) => api('/requests/current', { token: v.token }))))
      .filter((r) => r.body.request?.status === 'searching');
    check('the other 6 keep searching with an honest "full" reason',
      waiting.length === 6 && waiting.every((r) => r.body.request.reason === 'no_capacity_in_window'), waiting.map((r) => r.body.request?.reason));

    // ── 2. Everyone proposed confirms at the same moment ──
    const proposed = [];
    for (const p of pairings) {
      proposed.push([p.user_a_id, p.id], [p.user_b_id, p.id]);
    }
    const tokenFor = Object.fromEntries(crowd.map((v) => [v.id, v.token]));
    const confirms = await Promise.all(proposed.map(([userId, pid]) => h.confirmPairing({ token: tokenFor[userId] }, pid)));
    check('4 concurrent confirms all succeed', confirms.every((r) => r.status === 200), confirms.map((r) => r.status));
    check('both pairings confirmed', db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status = 'confirmed'").get(shift.id).n === 2);
    check('confirming never moves the counter past capacity', shiftRow(db, shift.id).capacity_booked === 4);
    const holds = db.prepare("SELECT COUNT(*) AS n FROM deeds_holds WHERE status = 'held'").get().n;
    check('exactly one hold per confirmed person, no double holds', holds === 4, holds);
    const again = await h.confirmPairing({ token: tokenFor[proposed[0][0]] }, proposed[0][1]);
    check('a repeated confirm is idempotent (no second hold)', again.status === 409 || db.prepare("SELECT COUNT(*) AS n FROM deeds_holds WHERE status = 'held'").get().n === 4);
    await stopAll(crowd);

    // ── 3. Solo RSVPs racing for a 3-spot shift ──
    const soloShift = await h.makeShift(org, { capacity: 3, daysAhead: 5, title: 'Solo race' });
    const racers = [];
    for (let i = 0; i < 8; i++) racers.push(await h.makeVolunteer({ name: `Racer${i}`, causes: ['Youth mentorship', 'Elder care'] }));
    const rsvps = await Promise.all(racers.map((v) => api(`/shifts/${soloShift.id}/rsvp-solo`, { method: 'POST', token: v.token })));
    check('8 concurrent solo RSVPs on 3 spots → exactly 3 succeed', rsvps.filter((r) => r.status === 201).length === 3, rsvps.map((r) => r.status));
    check('the rest are told the shift is full', rsvps.filter((r) => r.status === 409).every((r) => r.body.code === 'shift_full'));
    check('solo shift counter = 3 of 3', shiftRow(db, soloShift.id).capacity_booked === 3);

    // ── 4. Matching runs from several processes at once ──
    const org2 = await h.makeOrg({ mission_tags: ['Food banks & shelters'] });
    const searchers = [];
    for (let i = 0; i < 8; i++) searchers.push(await h.makeVolunteer({ name: `Multi${i}`, deeds: 5, causes: ['Food banks & shelters', 'Elder care'] }));
    for (const v of searchers) await h.startLooking(v); // no shift yet → all searching
    // Insert the shift directly (no route → no tick), then race four
    // matching passes: three child processes plus the server itself.
    const { zonedToUtc } = require('./lib/time');
    const day = await h.serverDate(4);
    const raceShiftId = 'race-shift-1';
    db.prepare(`
      INSERT INTO shifts (id, org_id, title, cause_tags, starts_at, ends_at, location_label, capacity_total, created_at)
      VALUES (?, ?, 'Race', '["Food banks & shelters"]', ?, ?, 'San Jose, CA', 2, ?)
    `).run(raceShiftId, org2.id, zonedToUtc(day, 9).toISOString(), zonedToUtc(day, 11).toISOString(), new Date().toISOString());
    const runner = (n) => new Promise((resolve) => {
      const child = spawn(process.execPath, ['-e', "require('./lib/matchingRunner').runMatching()"], {
        cwd: __dirname, env: { ...process.env }, stdio: 'ignore',
      });
      child.on('exit', (code) => resolve(code ?? n));
    });
    const codes = await Promise.all([runner(1), runner(2), runner(3), h.tick()]);
    check('parallel matching processes all finish cleanly', codes.slice(0, 3).every((c) => c === 0), codes);
    const raced = db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status = 'proposed'").get(raceShiftId).n;
    check('4 simultaneous matching passes on a 2-spot shift → exactly 1 pairing', raced === 1, raced);
    check('race shift counter = 2 of 2', shiftRow(db, raceShiftId).capacity_booked === 2 && liveBookings(db, raceShiftId) === 2);
    await stopAll(searchers);

    // ── 5. Boundaries: one spot left, odd capacity ──
    const org3 = await h.makeOrg({ mission_tags: ['Community organizing'] });
    const oneSpot = await h.makeShift(org3, { capacity: 1, daysAhead: 6, cause_tags: ['Community organizing'], title: 'One spot' });
    const pairA = await h.makeVolunteer({ deeds: 5, causes: ['Community organizing', 'Elder care'] });
    const pairB = await h.makeVolunteer({ deeds: 5, causes: ['Community organizing', 'Elder care'] });
    await h.startLooking(pairA);
    const b1 = await h.startLooking(pairB);
    check('a shift with only 1 spot never gets a pair', b1.body.status === 'searching' && shiftRow(db, oneSpot.id).capacity_booked === 0, b1.body);
    check('…and the user is told it is full', b1.body.reason === 'no_capacity_in_window', b1.body.reason);
    await stopAll([pairA, pairB]);

    const odd = await h.makeShift(org3, { capacity: 3, daysAhead: 7, cause_tags: ['Community organizing'], title: 'Three spots' });
    const four = [];
    for (let i = 0; i < 4; i++) four.push(await h.makeVolunteer({ deeds: 5, causes: ['Community organizing', 'Youth mentorship'] }));
    for (const v of four) await h.startLooking(v);
    const oddPairs = db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status = 'proposed'").get(odd.id).n;
    check('odd capacity (3) with 4 searchers → exactly one pair, one spot left unfilled', oddPairs === 1 && shiftRow(db, odd.id).capacity_booked === 2, { oddPairs, row: shiftRow(db, odd.id) });

    // Declining gives the spots back.
    const oddPairing = db.prepare("SELECT * FROM pairings WHERE shift_id = ? AND status = 'proposed'").get(odd.id);
    const decliner = four.find((v) => v.id === oddPairing.user_a_id);
    await api(`/pairings/${oddPairing.id}/decline`, { method: 'POST', token: decliner.token, body: { keep_looking: false } });
    check('a declined proposal releases its spots', db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE shift_id = ? AND status = 'proposed'").get(odd.id).n
      === shiftRow(db, odd.id).capacity_booked);

    // ── 6. The database itself refuses an overbook ──
    let threw = false;
    try {
      db.prepare('UPDATE shifts SET capacity_booked = capacity_total + 1 WHERE id = ?').run(shift.id);
    } catch {
      threw = true;
    }
    check('a direct write past capacity is rejected by the CHECK constraint', threw);

    const { reserveSpots } = require('./lib/shifts');
    check('reserveSpots refuses when not enough spots remain', reserveSpots(shift.id, 1) === false);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
