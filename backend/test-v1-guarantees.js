// Automated guarantees for the v1 matching rules (own server on :3050, own
// throwaway database; checks are named by behaviour):
//  1. A shift is never overbooked and no pairing ever joins two people whose
//     hard filters disagree. A seeded stress run (many volunteers with mixed
//     genders and gender preferences, ages, verification, dates, weekdays,
//     travel distances, causes, Premium hobby filters and monthly caps, over
//     several small shifts) runs matching repeatedly while people confirm,
//     decline or ignore proposals and the clock moves. After every action
//     the shift counters are audited against the live bookings, and every
//     new pairing is checked against every filter independently of the
//     matching code. The checker itself is proved against deliberately bad
//     pairings first, so a pass cannot be vacuous.
//  2. Bursts of simultaneous requests (and solo RSVPs) for a two-spot shift
//     produce exactly one pairing and never take a third spot.
//  3. The org data model: a waiver is uploaded or the platform default
//     chosen, and is stored and returned; an unverified org's shifts are
//     absent from every volunteer-facing surface and from matching until an
//     admin verifies the org.
const h = require('./test-helpers');

h.useTempDb('v1-guarantees');
const { check, api } = h;

const rules = require('./lib/rules');
const { localDate, addDays, monthKey } = require('./lib/time');
const { normaliseInterest } = require('./matching/person');
const { haversineMiles, safeParseArray } = require('./matching/engine');

// ── A small seeded generator (LCG) so every run builds the same crowd ──
function lcg(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick(list) { return list[Math.floor(next() * list.length)]; },
    sample(list, k) {
      const pool = [...list];
      const out = [];
      while (out.length < k && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      return out;
    },
  };
}

const weekdayOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

// ── The oracle: every reason a pairing must never exist, written from the
// product rules rather than from the matching code ──
// ctx = { pairing, shift, people: [side, side] } where a side is
// { user, request, capUsed, capPendingOthers, cap } (rows as stored).
function pairingViolations(ctx) {
  const out = [];
  const { pairing, shift, people } = ctx;
  const [x, y] = people;
  if (x.user.id === y.user.id) out.push('the same person on both sides');
  if (!shift.org_verified) out.push('the shift belongs to an unverified org');
  const day = localDate(new Date(shift.starts_at), shift.timezone);
  for (const me of people) {
    const them = me === x ? y : x;
    const u = me.user;
    const who = u.display_name;
    if (u.age == null || u.age < rules.MIN_AGE) out.push(`${who} is under the adult age`);
    if (!u.verified) out.push(`${who} is not ID-verified`);
    if (u.gender_pref === 'same_gender_only' && u.gender !== them.user.gender) out.push(`${who} wants the same gender only`);
    if (safeParseArray(u.flagged_users).includes(them.user.id) || safeParseArray(u.flagged_by).includes(them.user.id)) {
      out.push(`${who} has a safety flag with the partner`);
    }
    const r = me.request;
    if (r.kind === 'standard') {
      if (day < r.window_start || day > r.window_end) out.push(`${who}: the shift day is outside their dates`);
      const weekdays = safeParseArray(r.weekdays);
      if (weekdays.length > 0 && !weekdays.includes(weekdayOf(day))) out.push(`${who}: the shift falls on a weekday they did not choose`);
      const wanted = safeParseArray(r.hobby_filter).map(normaliseInterest).filter(Boolean);
      const theirs = new Set(safeParseArray(them.user.interest_tags).map(normaliseInterest));
      if (wanted.length > 0 && !wanted.some((hobby) => theirs.has(hobby))) out.push(`${who}: the partner shares none of their hobby filter`);
      if (u.location_lat != null && u.location_lng != null && shift.location_lat != null && shift.location_lng != null && r.travel_radius_miles != null
        && haversineMiles({ lat: u.location_lat, lng: u.location_lng }, { lat: shift.location_lat, lng: shift.location_lng }) > r.travel_radius_miles) {
        out.push(`${who}: the shift is beyond their travel distance`);
      }
    }
    if (pairing.origin !== 'rematch' && me.capUsed + me.capPendingOthers >= me.cap) out.push(`${who} was already at their monthly cap`);
  }
  const lead = Date.parse(shift.starts_at) - Date.parse(pairing.proposed_at);
  if (lead < rules.MIN_LEAD_MS) out.push('the shift starts inside the minimum lead time');
  return out;
}

// ── Negative controls: the oracle must flag each deliberately bad pairing ──
{
  const shift = { starts_at: '2030-03-05T17:00:00.000Z', timezone: rules.PLATFORM_TIMEZONE, org_verified: 1, location_lat: 37.3382, location_lng: -121.8863 };
  const day = localDate(new Date(shift.starts_at), shift.timezone);
  const side = (id, o = {}) => ({
    user: {
      id, display_name: id, age: 30, verified: 1, gender: 'Female', gender_pref: 'any', flagged_users: '[]', flagged_by: '[]',
      interest_tags: JSON.stringify(['hiking']), location_lat: 37.3382, location_lng: -121.8863, ...o.user,
    },
    request: { kind: 'standard', window_start: day, window_end: day, weekdays: null, hobby_filter: null, travel_radius_miles: 10, ...o.request },
    capUsed: 0, capPendingOthers: 0, cap: rules.FREE_MONTHLY_CAP, ...o.side,
  });
  const base = (a = {}, b = {}) => ({
    pairing: { origin: 'match', proposed_at: '2030-03-01T00:00:00.000Z' }, shift: { ...shift, ...a.shift }, people: [side('a', a), side('b', b)],
  });
  const flagged = (label, ctx, needle) => {
    const found = pairingViolations(ctx);
    check(`the checker flags ${label}`, found.some((v) => v.includes(needle)), found);
  };
  check('the checker accepts a pairing that meets every filter', pairingViolations(base()).length === 0, pairingViolations(base()));
  flagged('a person under the adult age', base({ user: { age: rules.MIN_AGE - 1 } }), 'under the adult age');
  flagged('an unverified person', base({}, { user: { verified: 0 } }), 'not ID-verified');
  flagged('a same-gender-only person paired across genders', base({ user: { gender_pref: 'same_gender_only' } }, { user: { gender: 'Male' } }), 'same gender only');
  flagged('a safety flag in either direction', base({}, { user: { flagged_by: JSON.stringify(['a']) } }), 'safety flag');
  flagged('a shift outside the dates', base({ request: { window_start: addDays(day, 1), window_end: addDays(day, 3) } }), 'outside their dates');
  flagged('a shift on an unchosen weekday', base({ request: { weekdays: JSON.stringify([(weekdayOf(day) + 1) % 7]) } }), 'weekday they did not choose');
  check('…and accepts the same shift when its local weekday is chosen',
    pairingViolations(base({ request: { weekdays: JSON.stringify([weekdayOf(day)]) } })).length === 0);
  flagged('a partner who shares none of the hobby filter', base({ request: { hobby_filter: JSON.stringify(['chess']) } }), 'hobby filter');
  flagged('a shift beyond the travel distance', base({ user: { location_lat: 38.58, location_lng: -121.49 } }), 'travel distance');
  flagged('a person already at their monthly cap', base({ side: { capUsed: rules.FREE_MONTHLY_CAP } }), 'monthly cap');
  flagged('a shift at an unverified org', base({ shift: { org_verified: 0 } }), 'unverified org');
  flagged('a shift inside the minimum lead time', { ...base(), pairing: { origin: 'match', proposed_at: '2030-03-05T16:00:00.000Z' } }, 'minimum lead');
}

async function main() {
  const { server } = await h.startServer();
  try {
    const db = require('./db');
    const premium = require('./lib/premium');
    const shiftsLib = require('./lib/shifts');
    void premium; void shiftsLib;
    const isolate = () => {
      db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
      db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status IN ('searching', 'proposed')").run();
    };

    // ════════════════════════════════════════════════════════════════
    // 1. Seeded stress run
    // ════════════════════════════════════════════════════════════════
    const rng = lcg(20261106);
    const SJ = { lat: 37.3382, lng: -121.8863 };
    const SAC = { lat: 38.5816, lng: -121.4944 };
    const CAUSES = ['Animal welfare', 'Environmental cleanups', 'Elder care'];
    const HOBBIES = ['hiking', 'chess', 'baking', 'climbing', 'pottery', 'birdwatching'];
    const GENDERS = ['Female', 'Male', 'Non-binary'];

    // Orgs and shifts: small capacities across consecutive days (so every
    // weekday occurs once), some in the evening so the local weekday differs
    // from the UTC one, one far away, one at an unverified org.
    const orgA = await h.makeOrg({ name: 'Stress Org A', mission_tags: ['Animal welfare', 'Elder care'], ...SJ });
    const orgB = await h.makeOrg({ name: 'Stress Org B', mission_tags: ['Environmental cleanups', 'Elder care'], ...SJ });
    const orgFar = await h.makeOrg({ name: 'Stress Org Far', mission_tags: ['Animal welfare'], ...SAC });
    const orgHidden = await h.makeOrg({ name: 'Stress Org Hidden', mission_tags: ['Animal welfare'], verified: false, ...SJ });
    const plan = [
      [orgA, 'Animal welfare', 2, 2, '09:00', '11:30'],
      [orgA, 'Elder care', 3, 3, '19:30', '21:30'],
      [orgB, 'Environmental cleanups', 2, 4, '22:00', '23:30'],
      [orgB, 'Elder care', 4, 5, '10:00', '12:00'],
      [orgA, 'Animal welfare', 2, 6, '18:00', '20:00'],
      [orgB, 'Environmental cleanups', 3, 7, '09:00', '12:00'],
      [orgA, 'Animal welfare', 2, 8, '08:00', '10:00'],
      [orgA, 'Elder care', 2, 9, '23:00', '23:59'],
    ];
    const shifts = [];
    for (const [org, cause, capacity, daysAhead, start, end] of plan) {
      shifts.push(await h.makeShift(org, { cause_tags: [cause], capacity, daysAhead, start_time: start, end_time: end, lat: SJ.lat, lng: SJ.lng }));
    }
    shifts.push(await h.makeShift(orgFar, { cause_tags: ['Animal welfare'], capacity: 2, daysAhead: 5, lat: SAC.lat, lng: SAC.lng }));
    const hiddenShift = await h.makeShift(orgHidden, { cause_tags: ['Animal welfare'], capacity: 2, daysAhead: 3, lat: SJ.lat, lng: SJ.lng });
    // A far-off shift that only holds the bookings used to put people at their cap.
    const ballast = await h.makeShift(orgHidden, { cause_tags: ['Elder care'], capacity: 40, daysAhead: 25, lat: SJ.lat, lng: SJ.lng });

    // The crowd.
    const people = [];
    const COUNT = 32;
    const makePerson = async (i) => {
      const special = ['unverified', 'unverified', 'revoked', 'minorData', 'minorData', 'capped', 'capped', 'capped', 'nearCap', 'nearCap', 'free'][i] ?? null;
      const far = i >= COUNT - 4;
      const home = far ? SAC : { lat: SJ.lat + (rng.next() - 0.5) * 0.3, lng: SJ.lng + (rng.next() - 0.5) * 0.3 };
      const spec = {
        special,
        far,
        gender: rng.pick(GENDERS),
        gender_pref: rng.chance(0.35) ? 'same_gender_only' : 'any',
        age: 18 + rng.int(45),
        causes: far ? ['Animal welfare'] : rng.sample(CAUSES, 1 + rng.int(3)),
        radius: far ? 15 : rng.pick([5, 15, 40]),
        hobbies: rng.sample(HOBBIES, 2 + rng.int(2)),
      };
      const vol = await h.makeVolunteer({
        prefix: `stress${i}`, name: `Stress${i}`, age: spec.age, gender: spec.gender, gender_pref: spec.gender_pref, causes: spec.causes,
        radius: spec.radius, lat: home.lat, lng: home.lng, hobbies: spec.hobbies.join(', '), deeds: 25, verify: special !== 'unverified',
      });
      return { ...spec, ...vol, free: ['capped', 'nearCap', 'free'].includes(special) };
    };
    for (let i = 0; i < COUNT; i++) people.push(await makePerson(i));
    const byId = new Map(people.map((p) => [p.id, p]));

    // Free-tier people have a trial that ended long ago; some are at the cap.
    const month = monthKey(new Date(await h.serverNow()));
    const insertBooking = db.prepare(`
      INSERT INTO bookings (id, user_id, shift_id, kind, status, cap_month, confirmed_at, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'solo', 'confirmed', ?, ?, ?)
    `);
    for (const p of people.filter((q) => q.free)) {
      db.prepare('UPDATE accounts SET created_at = ? WHERE id = (SELECT account_id FROM users WHERE id = ?)').run('2020-01-01T00:00:00.000Z', p.id);
      const used = p.special === 'capped' ? rules.FREE_MONTHLY_CAP : p.special === 'nearCap' ? rules.FREE_MONTHLY_CAP - 1 : 0;
      for (let k = 0; k < used; k++) insertBooking.run(p.id, ballast.id, month, new Date().toISOString(), new Date().toISOString());
      if (used) db.prepare('UPDATE shifts SET capacity_booked = capacity_booked + ? WHERE id = ?').run(used, ballast.id);
    }

    // A minor cannot get a profile at all.
    const minorSignup = await api('/auth/signup', { method: 'POST', body: { email: `minor-${Date.now()}@example.com`, password: 'testpassword1' } });
    const minorProfile = await api('/users', { method: 'POST', token: minorSignup.body.session_token, body: { first_name: 'Kid', age: rules.MIN_AGE - 1, gender: 'Female' } });
    check('a profile with an age under the adult line is refused outright', minorProfile.status === 400, minorProfile);

    // ── Auditing ──
    const seen = new Set();
    const bad = [];
    const capacityProblems = [];
    const capProblems = [];
    let audits = 0;
    const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    const shiftRow = (id) => db.prepare('SELECT s.*, o.verified AS org_verified FROM shifts s JOIN orgs o ON o.id = s.org_id WHERE s.id = ?').get(id);
    const capFor = (id) => (byId.get(id)?.free ? rules.FREE_MONTHLY_CAP : rules.PREMIUM_MONTHLY_CAP);
    const usedNow = (id, nowMs) => db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND cap_month = ?').get(id, monthKey(new Date(nowMs))).n;
    const pendingNow = (id) => db.prepare(`
      SELECT COUNT(*) AS n FROM bookings b JOIN pairings q ON q.id = b.pairing_id
      WHERE b.user_id = ? AND b.status = 'proposed' AND q.status = 'proposed'
    `).get(id).n;

    async function audit() {
      audits++;
      const nowMs = await h.serverNow();
      for (const pairing of db.prepare('SELECT * FROM pairings').all().filter((p) => !seen.has(p.id))) {
        seen.add(pairing.id);
        const sideOf = (userId, requestId, bookingId) => {
          const booking = db.prepare('SELECT status FROM bookings WHERE id = ?').get(bookingId);
          return {
            user: userRow(userId),
            request: db.prepare('SELECT * FROM availability_requests WHERE id = ?').get(requestId),
            capUsed: usedNow(userId, nowMs),
            capPendingOthers: pendingNow(userId) - (booking?.status === 'proposed' ? 1 : 0),
            cap: capFor(userId),
          };
        };
        const ctx = {
          pairing,
          shift: shiftRow(pairing.shift_id),
          people: [sideOf(pairing.user_a_id, pairing.request_a_id, pairing.booking_a_id), sideOf(pairing.user_b_id, pairing.request_b_id, pairing.booking_b_id)],
        };
        for (const v of pairingViolations(ctx)) bad.push(`${v} [pairing ${pairing.id.slice(0, 6)}]`);
      }
      for (const r of db.prepare(`
        SELECT s.id, s.capacity_total, s.capacity_booked,
          (SELECT COUNT(*) FROM bookings b WHERE b.shift_id = s.id AND b.status <> 'cancelled') AS live
        FROM shifts s
      `).all()) {
        if (r.capacity_booked > r.capacity_total || r.capacity_booked !== r.live) capacityProblems.push(r);
      }
      for (const p of people) {
        if (usedNow(p.id, nowMs) + pendingNow(p.id) > capFor(p.id) + 0) capProblems.push(`${p.name}: ${usedNow(p.id, nowMs)} used + ${pendingNow(p.id)} pending over ${capFor(p.id)}`);
      }
    }
    const act = async (fn) => { const result = await fn(); await audit(); return result; };

    const hasOpenRequest = (id) => Boolean(db.prepare("SELECT 1 FROM availability_requests WHERE user_id = ? AND status IN ('searching', 'proposed')").get(id));
    const search = async (p) => {
      const startOffset = 1 + rng.int(3);
      const endOffset = startOffset + 3 + rng.int(6);
      const windowStart = await h.serverDate(startOffset);
      const windowEnd = await h.serverDate(endOffset);
      const days = [];
      for (let d = windowStart; d <= windowEnd; d = addDays(d, 1)) days.push(d);
      const weekdays = rng.chance(0.5) ? rng.sample([...new Set(days.map(weekdayOf))], 1 + rng.int(3)) : null;
      const extra = {};
      if (weekdays) extra.weekdays = weekdays;
      if (!p.free && rng.chance(0.35)) extra.hobby_filter = rng.sample(HOBBIES, 1 + rng.int(2));
      return act(() => h.startLooking(p, { window_start: windowStart, window_end: windowEnd, preference: rng.chance(0.7) ? 'anyone' : 'best', extra }));
    };

    // Round 0: everybody tries to start looking.
    const refused = [];
    for (const p of rng.sample(people, people.length)) {
      const res = await search(p);
      if (res.status !== 201) refused.push(p);
      // Data problems that appear after a search has started.
      if (res.status === 201 && p.special === 'minorData') {
        db.prepare('UPDATE users SET age = ? WHERE id = ?').run(rules.MIN_AGE - 1, p.id);
        await act(() => h.tick());
      }
      if (res.status === 201 && p.special === 'revoked') {
        db.prepare('UPDATE users SET verified = 0 WHERE id = ?').run(p.id);
        await act(() => h.tick());
      }
    }
    check('people who never verified are refused when they try to start looking',
      people.filter((p) => p.special === 'unverified').every((p) => refused.includes(p)), refused.map((p) => p.special));
    // A few people take a spot on a shift on their own.
    for (const p of rng.sample(people.filter((q) => !q.special && !q.far), 3)) {
      const open = db.prepare("SELECT id FROM shifts WHERE status = 'open' AND capacity_total >= 3 AND capacity_booked < capacity_total AND org_id IN (?, ?)").all(orgA.id, orgB.id);
      if (open.length) await act(() => api(`/shifts/${rng.pick(open).id}/rsvp-solo`, { method: 'POST', token: p.token }));
    }

    const ROUNDS = 8;
    const ROUND_HOURS = 4;
    let confirmedPairs = 0;
    for (let round = 0; round < ROUNDS; round++) {
      // People answer what is waiting for them.
      for (const pairing of db.prepare("SELECT * FROM pairings WHERE status = 'proposed'").all()) {
        const a = byId.get(pairing.user_a_id);
        const b = byId.get(pairing.user_b_id);
        if (!a || !b) continue;
        const roll = rng.next();
        if (roll < 0.4) {
          for (const p of [a, b]) await act(() => h.confirmPairing(p, pairing.id));
          confirmedPairs++;
        } else if (roll < 0.6) {
          await act(() => api(`/pairings/${pairing.id}/decline`, { method: 'POST', token: rng.chance(0.5) ? a.token : b.token, body: { keep_looking: true } }));
        }
      }
      // Some people without an open search start a new one.
      for (const p of people) {
        if (p.special === 'unverified' || hasOpenRequest(p.id) || !rng.chance(0.3)) continue;
        await search(p);
      }
      await act(() => h.advance({ hours: ROUND_HOURS }));
      await act(() => h.tick());
    }

    const allPairings = db.prepare('SELECT * FROM pairings').all();
    const confirmed = allPairings.filter((p) => p.status === 'confirmed' || p.status === 'completed');
    console.log(`stress: ${people.length} people, ${shifts.length + 1} shifts, ${allPairings.length} pairings (${confirmed.length} confirmed), ${audits} audits`);

    check('the stress run proposed a meaningful number of pairings', allPairings.length >= 6, allPairings.length);
    check('…some of them confirmed by both people', confirmed.length >= 2, confirmed.length);
    check('…spread over several different shifts', new Set(allPairings.map((p) => p.shift_id)).size >= 3, new Set(allPairings.map((p) => p.shift_id)).size);
    check(`every one of ${audits} audits found each shift within its capacity and its counter equal to its live bookings`,
      capacityProblems.length === 0, capacityProblems.slice(0, 3));
    check('every proposed or confirmed pairing met every hard filter: adult age, verified, same-gender rule, no safety flag, chosen weekdays, both date windows, travel distance, hobby filter and monthly cap',
      bad.length === 0, bad.slice(0, 5));
    check('nobody was ever more than their monthly cap (confirmed plus pending proposals)', capProblems.length === 0, capProblems.slice(0, 3));
    const pairedIds = new Set(allPairings.flatMap((p) => [p.user_a_id, p.user_b_id]));
    const excluded = (label) => people.filter((p) => p.special === label);
    check('people who never verified, lost their verification, or whose age fell below the adult line were never paired',
      [...excluded('unverified'), ...excluded('revoked'), ...excluded('minorData')].every((p) => !pairedIds.has(p.id)),
      [...excluded('unverified'), ...excluded('revoked'), ...excluded('minorData')].filter((p) => pairedIds.has(p.id)).map((p) => p.special));
    check('people already at their monthly cap were never paired, and their search says why',
      excluded('capped').every((p) => !pairedIds.has(p.id)
        && (db.prepare("SELECT last_reason FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(p.id)?.last_reason === 'monthly_cap_reached')),
      excluded('capped').map((p) => [pairedIds.has(p.id), db.prepare('SELECT last_reason FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(p.id)?.last_reason]));
    check("nobody was ever paired onto the unverified org's shift", !allPairings.some((p) => p.shift_id === hiddenShift.id) && db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE shift_id = ?').get(hiddenShift.id).n === 0);
    const farPairs = allPairings.filter((p) => byId.get(p.user_a_id)?.far || byId.get(p.user_b_id)?.far);
    check('people far from every nearby shift were only ever paired onto shifts within their reach',
      farPairs.every((p) => byId.get(p.user_a_id).far === byId.get(p.user_b_id).far && shifts[8].id === p.shift_id), farPairs.map((p) => p.shift_id));

    // ════════════════════════════════════════════════════════════════
    // 2. Simultaneous requests for a two-spot shift
    // ════════════════════════════════════════════════════════════════
    const burstOrg = await h.makeOrg({ name: 'Burst Org', mission_tags: ['Animal welfare'], ...SJ });
    const live = (shiftId) => db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE shift_id = ? AND status <> 'cancelled'").get(shiftId).n;
    const counters = (shiftId) => db.prepare('SELECT capacity_total, capacity_booked FROM shifts WHERE id = ?').get(shiftId);
    const pairingsOn = (shiftId) => db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status IN ('proposed', 'confirmed')").get(shiftId).n;

    isolate();
    const twoSpots = await h.makeShift(burstOrg, { cause_tags: ['Animal welfare'], capacity: 2, daysAhead: 4 });
    const crowd = [];
    for (let i = 0; i < 8; i++) crowd.push(await h.makeVolunteer({ prefix: 'burst', name: `Burst${i}`, deeds: 25 }));
    const results = await Promise.all(crowd.map((v) => h.startLooking(v)));
    check('every simultaneous request was accepted as a search', results.every((r) => r.status === 201), results.map((r) => r.status));
    check('eight simultaneous requests for a two-spot shift make exactly one pairing', pairingsOn(twoSpots.id) === 1, pairingsOn(twoSpots.id));
    check('…which holds exactly the two spots, with the counter equal to the live bookings', counters(twoSpots.id).capacity_booked === 2 && live(twoSpots.id) === 2, { counters: counters(twoSpots.id), live: live(twoSpots.id) });
    const stillSearching = db.prepare(`SELECT COUNT(*) AS n FROM availability_requests WHERE status = 'searching' AND user_id IN (${crowd.map(() => '?').join(',')})`).get(...crowd.map((v) => v.id)).n;
    check('…and the other six are still searching, with a clear reason that no spot is left',
      stillSearching === 6 && db.prepare(`SELECT COUNT(*) AS n FROM availability_requests WHERE status = 'searching' AND last_reason = 'no_capacity_in_window' AND user_id IN (${crowd.map(() => '?').join(',')})`).get(...crowd.map((v) => v.id)).n === 6, stillSearching);
    await h.tick();
    await h.advance({ hours: 2 });
    check('more matching rounds afterwards do not add a second pairing or take another spot', pairingsOn(twoSpots.id) === 1 && counters(twoSpots.id).capacity_booked === 2 && live(twoSpots.id) === 2);

    // Requests and solo RSVPs racing for the same two spots.
    isolate();
    const mixedShift = await h.makeShift(burstOrg, { cause_tags: ['Animal welfare'], capacity: 2, daysAhead: 5 });
    const seekers = [];
    const rsvpers = [];
    for (let i = 0; i < 4; i++) seekers.push(await h.makeVolunteer({ prefix: 'mixseek', name: `Seeker${i}`, deeds: 25 }));
    for (let i = 0; i < 4; i++) rsvpers.push(await h.makeVolunteer({ prefix: 'mixrsvp', name: `Rsvp${i}`, deeds: 25 }));
    await Promise.all([
      ...seekers.map((v) => h.startLooking(v, { window_start: addDays(localDate(new Date(mixedShift.starts_at)), -1), window_end: addDays(localDate(new Date(mixedShift.starts_at)), 1) })),
      ...rsvpers.map((v) => api(`/shifts/${mixedShift.id}/rsvp-solo`, { method: 'POST', token: v.token })),
    ]);
    check('requests and solo RSVPs racing for a two-spot shift never take more than two spots',
      counters(mixedShift.id).capacity_booked <= 2 && counters(mixedShift.id).capacity_booked === live(mixedShift.id), { counters: counters(mixedShift.id), live: live(mixedShift.id) });
    check('…and at most one pairing exists on it', pairingsOn(mixedShift.id) <= 1, pairingsOn(mixedShift.id));

    // ════════════════════════════════════════════════════════════════
    // 3. Org data model: waiver and verification gate
    // ════════════════════════════════════════════════════════════════
    isolate();
    const waiverOrg = await h.makeOrg({ name: 'Waiver Org', mission_tags: ['Animal welfare'], verified: false, ...SJ });
    const outsider = await h.makeVolunteer({ prefix: 'waiver', name: 'Outsider' });
    const initial = await api('/orgs/mine', { token: waiverOrg.token });
    check('an org that chose the platform default has it recorded', initial.body.waiver?.kind === 'platform_default' && Boolean(initial.body.waiver.uploaded_at), initial.body.waiver);
    check('…and there is no uploaded file to fetch', (await api('/orgs/mine/waiver', { token: waiverOrg.token })).status === 404);
    const pdf = Buffer.from('%PDF-1.4\n% waiver for the guarantees suite\n%%EOF\n');
    const uploaded = await api('/orgs/mine/waiver', { method: 'POST', token: waiverOrg.token, body: { mime: 'application/pdf', data_base64: pdf.toString('base64') } });
    check('an org can upload its own waiver (PDF) and it is recorded as uploaded', uploaded.status === 200 && uploaded.body.waiver?.kind === 'uploaded' && Boolean(uploaded.body.waiver.uploaded_at), uploaded.body);
    const stored = await fetch(`${h.BASE}/orgs/mine/waiver`, { headers: { Authorization: `Bearer ${waiverOrg.token}` } });
    const storedBytes = Buffer.from(await stored.arrayBuffer());
    check('the uploaded waiver is returned to the org exactly as uploaded, with its type', stored.status === 200 && stored.headers.get('content-type')?.startsWith('application/pdf') && storedBytes.equals(pdf), { status: stored.status, type: stored.headers.get('content-type') });
    check('the org profile now shows the uploaded waiver', (await api('/orgs/mine', { token: waiverOrg.token })).body.waiver?.kind === 'uploaded');
    check('a volunteer cannot read an org waiver', (await api('/orgs/mine/waiver', { token: outsider.token })).status === 403);
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const replaced = await api('/orgs/mine/waiver', { method: 'POST', token: waiverOrg.token, body: { mime: 'image/png', data_base64: png.toString('base64') } });
    const replacedFetch = await fetch(`${h.BASE}/orgs/mine/waiver`, { headers: { Authorization: `Bearer ${waiverOrg.token}` } });
    check('uploading again replaces the stored waiver (a photo this time)', replaced.status === 200 && replacedFetch.headers.get('content-type')?.startsWith('image/png') && Buffer.from(await replacedFetch.arrayBuffer()).equals(png));
    const wrongType = await api('/orgs/mine/waiver', { method: 'POST', token: waiverOrg.token, body: { mime: 'text/html', data_base64: Buffer.from('<script>1</script>').toString('base64') } });
    const tooBig = await api('/orgs/mine/waiver', { method: 'POST', token: waiverOrg.token, body: { mime: 'application/pdf', data_base64: Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString('base64') } });
    check('a waiver that is not a JPEG, PNG or PDF is refused', wrongType.status === 400, wrongType.body);
    check('…and so is one over the size limit', tooBig.status === 400, tooBig.status);
    check('refused uploads leave the previous waiver in place', (await api('/orgs/mine', { token: waiverOrg.token })).body.waiver?.kind === 'uploaded');
    const back = await api('/orgs/mine/waiver', { method: 'POST', token: waiverOrg.token, body: { use_default: true } });
    check('choosing the platform default again replaces the upload', back.status === 200 && back.body.waiver?.kind === 'platform_default', back.body.waiver);
    check('…and there is nothing left to fetch', (await api('/orgs/mine/waiver', { token: waiverOrg.token })).status === 404);

    // Visibility is gated on verification, everywhere a volunteer could see a shift.
    const gateShift = await h.makeShift(waiverOrg, { cause_tags: ['Animal welfare'], capacity: 4, daysAhead: 3, title: 'Gate shift' });
    const day = localDate(new Date(gateShift.starts_at), gateShift.timezone);
    const vA = await h.makeVolunteer({ prefix: 'gate', name: 'GateA', deeds: 25 });
    const vB = await h.makeVolunteer({ prefix: 'gate', name: 'GateB', deeds: 25 });
    const vC = await h.makeVolunteer({ prefix: 'gate', name: 'GateC', deeds: 25 });
    const surfaces = async () => ({
      shifts: (await api('/shifts', { token: vA.token })).body.shifts.some((s) => s.id === gateShift.id),
      directory: (await api('/orgs?q=Waiver%20Org', { token: vA.token })).body.orgs.some((o) => o.id === waiverOrg.id),
      orgPage: (await api(`/orgs/${waiverOrg.id}`, { token: vA.token })).status,
      calendar: (await api(`/requests/calendar?from=${day}&to=${day}`, { token: vA.token })).body.days?.[0]?.colour,
    });
    const before = await surfaces();
    check("an unverified org's shift is absent from the shift list", before.shifts === false, before);
    check('…the org is absent from the directory and has no public page', before.directory === false && before.orgPage === 404, before);
    check('…and its day stays red on the search calendar', before.calendar === 'red', before);
    const rsvpBefore = await api(`/shifts/${gateShift.id}/rsvp-solo`, { method: 'POST', token: vC.token });
    check('…a solo RSVP for it is refused and takes no spot', rsvpBefore.status === 404 && counters(gateShift.id).capacity_booked === 0 && live(gateShift.id) === 0, rsvpBefore);
    await h.startLooking(vA);
    await h.startLooking(vB);
    check("…and matching never pairs people onto it, however well they fit", pairingsOn(gateShift.id) === 0 && counters(gateShift.id).capacity_booked === 0);
    const unverifiedReason = (await api('/requests/current', { token: vA.token })).body.request?.reason;
    check('…the waiting people are told no shift fits, not that something is wrong with them', unverifiedReason === 'no_shift_in_shared_causes', unverifiedReason);

    const verify = await api(`/admin/orgs/${waiverOrg.id}/verify`, { method: 'POST', admin: true, body: { verified: true } });
    check('an admin can verify the org', verify.status === 200 && verify.body.verified === true, verify.body);
    const after = await surfaces();
    check('once verified, its shift appears in the shift list', after.shifts === true, after);
    check('…the org appears in the directory and has a public page', after.directory === true && after.orgPage === 200, after);
    check('…and its day is no longer red on the search calendar', after.calendar !== 'red' && after.calendar != null, after);
    check('…the two people already searching are paired onto it', pairingsOn(gateShift.id) === 1 && counters(gateShift.id).capacity_booked === 2, { pairings: pairingsOn(gateShift.id), counters: counters(gateShift.id) });
    const rsvpAfter = await api(`/shifts/${gateShift.id}/rsvp-solo`, { method: 'POST', token: vC.token });
    check('…and a solo RSVP for it now works', rsvpAfter.status === 201 && counters(gateShift.id).capacity_booked === 3, rsvpAfter);

    await api(`/admin/orgs/${waiverOrg.id}/verify`, { method: 'POST', admin: true, body: { verified: false } });
    const hiddenAgain = await surfaces();
    check('if an admin withdraws verification, the shift and the org disappear again', hiddenAgain.shifts === false && hiddenAgain.directory === false && hiddenAgain.orgPage === 404, hiddenAgain);
    const vD = await h.makeVolunteer({ prefix: 'gate', name: 'GateD', deeds: 25 });
    check('…and new solo RSVPs are refused again', (await api(`/shifts/${gateShift.id}/rsvp-solo`, { method: 'POST', token: vD.token })).status === 404);
    check('…without changing the spots already held', counters(gateShift.id).capacity_booked === live(gateShift.id));
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
