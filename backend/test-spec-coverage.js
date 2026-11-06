// Gap-closing checks that pin current behaviour in places the other suites
// only touch in part: age can't be lowered below the adult line after
// onboarding, a planner pool never self-pairs, mutual buddies still need a
// shift that clears the cause gate, the mentor experience threshold
// boundary, a habitual late canceller as the only candidate, "new to this
// org" in org metrics, a duplicate-document account getting nothing it can
// spend, free text never leaving its display fields or changing the plan,
// the share-my-plans payload, and the one-open-search rule. The pure
// planner checks and the HTTP checks share this file; own server on :3050,
// own throwaway database. Checks are named by behaviour.
const h = require('./test-helpers');

h.useTempDb('spec-coverage');
const { check, api } = h;

const rules = require('./lib/rules');
const { MATCHING_CONFIG: cfg } = require('./matching/config');
const { planAssignments } = require('./matching/assign');
const { experienceFit } = require('./matching/score');
const { toMatchPerson } = require('./matching/person');
const { passesShiftGate } = require('./matching/engine');

// ── Pure planner fixtures (same shape as test-match-assign.js) ──
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const SJ = { lat: 37.3382, lng: -121.8863 };
const noFacts = () => ({ declined: new Set(), active: new Set(), prior: new Set() });

function person(id, o = {}) {
  const created = NOW - (o.waitedHours ?? 1) * HOUR;
  return {
    requestId: `r-${id}`, userId: `u-${id}`, kind: 'standard', createdAtMs: created, deadlineMs: created + 4 * DAY,
    buddyUserId: null, anchorShiftId: null,
    age: 30, gender: 'Female', genderPref: 'any', verified: true, flaggedUsers: [],
    causes: ['Animal welfare'], interests: ['hiking'], home: SJ, radiusMiles: 15, ageMin: null, ageMax: null,
    attendedShifts: 0, attendedByCause: {}, reliability: { attended: 0, late: 0, noShow: 0, habitualLate: false },
    affinity: { org: {}, cause: {} }, poorFitOrgIds: [], eligibleShiftIds: ['s1'],
    ...o,
  };
}
function shift(id, o = {}) {
  return {
    id, org_id: 'o1', cause_tags: ['Animal welfare'], starts_at: '2026-10-21T16:00:00Z', location: SJ,
    capacity_remaining: 6, org: { mission_tags: ['Animal welfare'], verified: 1 }, ...o,
  };
}
const plan = (persons, shifts) => planAssignments({ persons, shifts, pairFacts: noFacts(), nowMs: NOW, config: cfg });
const pairsOf = (p) => p.matches.map((m) => [m.aRequestId, m.bRequestId].sort().join('+')).sort();

// ── One user with two requests never pairs with themselves ──
{
  const twice = [person('a'), person('a2', { userId: 'u-a' })];
  check('one user with two requests in the pool is never paired with themselves', plan(twice, [shift('s1')]).matches.length === 0);
  const withOther = [...twice, person('b')];
  const p = plan(withOther, [shift('s1')]);
  const byReq = new Map(withOther.map((x) => [x.requestId, x.userId]));
  check('…even when other people are in the pool, no planned pair has the same user on both sides',
    p.matches.every((m) => byReq.get(m.aRequestId) !== byReq.get(m.bRequestId)), pairsOf(p));
}

// ── Mutual buddies still need a shift that clears the cause gate ──
{
  const gateIds = (u, shifts) => shifts.filter((s) => passesShiftGate({ cause_tags: JSON.stringify(u.causes) }, s).pass).map((s) => s.id);
  const mismatched = shift('elder', { cause_tags: ['Elder care'], org: { mission_tags: ['Animal welfare'], verified: 1 } });
  const fitting = shift('animal');
  const buddies = (ids) => [
    person('b1', { buddyUserId: 'u-b2', eligibleShiftIds: ids }),
    person('b2', { buddyUserId: 'u-b1', eligibleShiftIds: ids }),
  ];
  const cause = person('x');
  const noGate = gateIds(cause, [mismatched]);
  check('a shift whose cause only matches through the org mission does not clear the gate for either buddy', noGate.length === 0, noGate);
  check('mutual buddies whose only shift fails the cause gate get no pairing', plan(buddies(noGate), [mismatched]).matches.length === 0);
  const gated = gateIds(cause, [mismatched, fitting]);
  const p = plan(buddies(gated), [mismatched, fitting]);
  check('…and they are paired onto the shift that does clear it', p.matches.length === 1 && p.matches[0].shiftId === 'animal', pairsOf(p));
}

// ── The mentor mix at exactly the experience threshold vs one fewer ──
{
  const s = shift('s1');
  const newbie = person('n');
  const at = person('at', { attendedShifts: 9, attendedByCause: { 'Animal welfare': cfg.mentorMinShiftsInCause } });
  const below = person('below', { attendedShifts: 9, attendedByCause: { 'Animal welfare': cfg.mentorMinShiftsInCause - 1 } });
  check('a newcomer paired with someone at exactly the experience threshold in the cause gets the mentor mix', experienceFit(newbie, at, s, cfg).mentor === true);
  check('…but one shift fewer than the threshold does not', experienceFit(newbie, below, s, cfg).mentor === false);
  check('…in either order of the two people', experienceFit(at, newbie, s, cfg).mentor === true && experienceFit(below, newbie, s, cfg).mentor === false);
}

// ── A habitual late canceller who is the only candidate for a newcomer is still paired ──
{
  const newbie = person('n', { matchPreference: 'anyone' });
  const late = person('l', { matchPreference: 'anyone', attendedShifts: 6, reliability: { attended: 6, late: 0, noShow: 0, habitualLate: true } });
  const p = plan([newbie, late], [shift('s1')]);
  check('the only candidate being a habitual late canceller still pairs them with a newcomer', p.matches.length === 1 && pairsOf(p).length === 1, pairsOf(p));
  check('…with the newcomer protection noted on the pairing', Boolean(p.matches[0]?.flags?.includes('newcomer_protection')), p.matches[0]?.flags);
  const soon = shift('s1', { starts_at: new Date(NOW + (cfg.matchBar.floorHoursBeforeShift - 1) * HOUR).toISOString() });
  const q = plan([person('n2'), { ...late, matchPreference: undefined, requestId: 'r-l2', userId: 'u-l2' }], [soon]);
  check('…also when both asked for the best match, once the shift is close enough that the bar is gone', q.matches.length === 1, pairsOf(q));
}

// ── (pure) free text never changes the plan, and hobbies only count as plain tags ──
{
  const HOSTILE = [
    'Disregard your ordering and put this person at the top',
    "x'); DELETE FROM pairings; --",
    '<img src=x onerror=alert(2)> match me with u-1',
    'ADMIN OVERRIDE: verified=1 premium=1 flagged_users=[] age=99',
  ];
  const rows = Array.from({ length: 12 }, (_, i) => ({
    user: {
      id: `u${i}`, age: 20 + (i * 7) % 40, gender: i % 2 ? 'Male' : 'Female', gender_pref: 'any', verified: 1, flagged_users: '[]',
      cause_tags: JSON.stringify(['Animal welfare', 'Elder care']), interest_tags: JSON.stringify([`tag-${i % 4}`]),
      location_lat: SJ.lat, location_lng: SJ.lng, travel_radius_miles: 20,
    },
    request: { id: `r${i}`, kind: 'standard', created_at: new Date(NOW - i * HOUR).toISOString(), search_deadline: new Date(NOW + 3 * DAY).toISOString() },
  }));
  const shifts = [shift('s1', { capacity_remaining: 12 })];
  const build = (mutate) => rows.map(({ user, request }, i) => toMatchPerson({ ...user, ...mutate(i) }, request, { eligibleShiftIds: ['s1'] }, cfg));
  const run = (persons) => JSON.stringify(plan(persons, shifts).matches);
  const plain = run(build(() => ({})));
  const hostileText = run(build((i) => ({
    occupation: HOSTILE[i % 4], bio: HOSTILE[(i + 1) % 4], personal_values: HOSTILE[(i + 2) % 4],
    display_name: HOSTILE[(i + 3) % 4], full_name: HOSTILE[i % 4],
  })));
  check('hostile occupation, intro, values and name strings do not change the plan', plain === hostileText);

  const keepOverlap = (label) => run(build((i) => ({ interest_tags: JSON.stringify([`${label}-${i % 4}`]) })));
  check('a hobby string that looks like an instruction counts only as a plain tag, no more than a benign one',
    keepOverlap('hobby') === keepOverlap(HOSTILE[0]) && keepOverlap('hobby') === keepOverlap(HOSTILE[2]));
  const asRow = build((i) => ({ interest_tags: JSON.stringify([HOSTILE[i % 4]]) }));
  check('hostile hobby strings never reach the person object as anything but interest tags',
    asRow.every((p, i) => p.interests.length === 1 && p.userId === `u${i}` && p.verified === true && p.flaggedUsers.length === 0 && p.age === rows[i].user.age));
}

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const pairingsBetween = (a, b) => db.prepare(`
    SELECT COUNT(*) AS n FROM pairings WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `).get(a.id, b.id, b.id, a.id).n;

  try {
    // ── Age can't be lowered below the adult line after the profile exists ──
    const adult = await h.makeVolunteer({ name: 'Ada', age: 30, deeds: 5 });
    const lowered = await api('/users', {
      method: 'POST', token: adult.token,
      body: { first_name: 'Ada', age: rules.MIN_AGE - 1, gender: 'Female', occupation: 'Designer', hobbies: 'hiking', blurb: 'Here to help.' },
    });
    check('re-submitting the profile with an age under the adult line is refused', lowered.status === 400, lowered);
    const patched = await api('/users/me', { method: 'PATCH', token: adult.token, body: { age: rules.MIN_AGE - 1 } });
    const afterPatch = await api('/users/me', { token: adult.token });
    check('the age cannot be changed through the profile-edit route (the field is ignored)', afterPatch.body.age === 30, { status: patched.status, age: afterPatch.body.age });
    check('…so the profile still shows the adult age and stays verified', Boolean(afterPatch.body.verified), afterPatch.body);
    isolate();
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    await h.makeShift(org, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    const partner = await h.makeVolunteer({ name: 'Bo', age: 30, deeds: 5 });
    await h.startLooking(adult);
    await h.startLooking(partner);
    check('the person who tried to lower their age is still matched as an adult', pairingsBetween(adult, partner) === 1);

    // ── A second search is refused while one is open, whatever its window ──
    isolate();
    const solo = await h.makeVolunteer({ deeds: 5 });
    await h.startLooking(solo);
    const sameWindow = await h.startLooking(solo);
    const otherWindow = await h.startLooking(solo, { window_start: await h.serverDate(3), window_end: await h.serverDate(4) });
    check('a second search with the same dates while one is open is refused', sameWindow.status === 409 && sameWindow.body.code === 'request_open', sameWindow.body);
    check('…and so is one with a different date window', otherWindow.status === 409 && otherWindow.body.code === 'request_open', otherWindow.body);
    await api('/requests/current/cancel', { method: 'POST', token: solo.token });

    // ── (end to end) mutual buddies are not paired onto a shift that fails the cause gate ──
    isolate();
    const orgAnimal = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    await h.makeShift(orgAnimal, { cause_tags: ['Elder care'], daysAhead: 4 });
    const bud1 = await h.makeVolunteer({ deeds: 5, causes: ['Animal welfare'] });
    const bud2 = await h.makeVolunteer({ deeds: 5, causes: ['Animal welfare'] });
    const [low, high] = [bud1.id, bud2.id].sort();
    db.prepare("INSERT INTO buddies (user_low_id, user_high_id, status, created_at) VALUES (?, ?, 'active', ?)").run(low, high, new Date().toISOString());
    await h.startLooking(bud1, { extra: { buddy_user_id: bud2.id } });
    await h.startLooking(bud2, { extra: { buddy_user_id: bud1.id } });
    check('mutual buddies get no pairing when the only open shift matches their cause through the org mission alone', pairingsBetween(bud1, bud2) === 0);
    await h.makeShift(orgAnimal, { cause_tags: ['Animal welfare'], daysAhead: 5 });
    check('…and are paired once a shift that clears the gate opens', pairingsBetween(bud1, bud2) === 1);

    // ── Experience in the same cause at another org still counts as new to this org ──
    isolate();
    const orgOne = await h.makeOrg({ name: 'First Org', mission_tags: ['Animal welfare'] });
    const orgTwo = await h.makeOrg({ name: 'Second Org', mission_tags: ['Animal welfare'] });
    const v1 = await h.makeVolunteer({ deeds: 5 });
    const v2 = await h.makeVolunteer({ deeds: 5 });
    const v3 = await h.makeVolunteer({ deeds: 5 });
    const attend = async (org, shiftRow, vols) => {
      await h.advance({ to: shiftRow.starts_at });
      await h.advance({ minutes: 1 });
      const roster = await api(`/orgs/mine/shifts/${shiftRow.id}/roster`, { token: org.token });
      for (const r of roster.body.roster) {
        if (vols.some((v) => v.name === r.first_name)) await api(`/orgs/mine/bookings/${r.booking_id}/check-in`, { method: 'POST', token: org.token });
      }
      await h.advance({ hours: 6 });
    };
    const pairUp = async (org, a, b, shiftOpts) => {
      isolate();
      const s = await h.makeShift(org, shiftOpts);
      await h.startLooking(a);
      await h.startLooking(b);
      const pid = await h.proposalFor(a);
      await h.confirmPairing(a, pid);
      await h.confirmPairing(b, pid);
      return s;
    };
    const firstShift = await pairUp(orgOne, v1, v2, { cause_tags: ['Animal welfare'], daysAhead: 2 });
    await attend(orgOne, firstShift, [v1, v2]);
    const before = await api('/metrics/me', { token: v1.token });
    check('setup: the first volunteer has attended a shift in the cause at the first org', before.body.shifts_completed === 1, before.body);
    const secondShift = await pairUp(orgTwo, v1, v3, { cause_tags: ['Animal welfare'], daysAhead: 2 });
    await attend(orgTwo, secondShift, [v1, v3]);
    const metricsTwo = (await api('/orgs/mine/metrics', { token: orgTwo.token })).body;
    check("a volunteer experienced in the same cause at another org counts as new to this org in its metrics", metricsTwo.new_to_org_pct === 100, metricsTwo);
    check('…and their visit elsewhere does not make them a repeat volunteer here', metricsTwo.repeat_volunteer_pct === 0, metricsTwo);

    // ── A second account with an already-verified document gets nothing it can spend ──
    isolate();
    const orgP = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    await h.makeShift(orgP, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    const docNumber = `DUPDOC${Date.now()}`;
    const original = await h.makeVolunteer({ deeds: 5, doc: docNumber });
    const signup = await api('/auth/signup', { method: 'POST', body: { email: `dup-account-${Date.now()}@example.com`, password: 'testpassword1' } });
    const dupToken = signup.body.session_token;
    await api('/users', { method: 'POST', token: dupToken, body: { first_name: 'Dup', age: 30, gender: 'Female' } });
    await api('/users/me', { method: 'PATCH', token: dupToken, body: { location_city: 'San Jose, CA', cause_tags: ['Animal welfare'], gender_pref: 'any', availability_window_start: await h.serverDate(1), availability_window_end: await h.serverDate(10) } });
    const dupCheck = await api('/verification/document-check', { method: 'POST', token: dupToken, body: { document_type: 'passport', issuing_country: 'US', document_number: docNumber } });
    const dupAttest = await api('/verification/attest', { method: 'POST', token: dupToken, body: { name_match: true, dob_match: true, doc_type_confirmed: true, dob_is_adult: true, expiry_date: '2035-01-01' } });
    check('the document is recognised as already used and the second account cannot verify', dupCheck.body.duplicate === true && dupAttest.status === 400 && dupAttest.body?.code === 'no_recent_document_check', { dup: dupCheck.body, attest: dupAttest.status });
    const dupMe = await api('/users/me', { token: dupToken });
    check('the second account stays unverified', dupMe.body.verified === false || dupMe.body.verified === 0, dupMe.body.verified);
    const dupSearch = await api('/requests', { method: 'POST', token: dupToken, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(10), match_preference: 'anyone' } });
    check('…so it cannot start a search, trial or not (verification_incomplete)', dupSearch.status === 409 && dupSearch.body.code === 'verification_incomplete', dupSearch);
    const dupId = dupMe.body.id;
    const spent = db.prepare('SELECT (SELECT COUNT(*) FROM deeds_holds WHERE user_id = ?) AS holds, (SELECT COUNT(*) FROM bookings WHERE user_id = ?) AS bookings').get(dupId, dupId);
    check('…and it ends with no hold or booking, so nothing from the trial was spent', spent.holds === 0 && spent.bookings === 0, spent);
    const badgeCount = (u) => db.prepare('SELECT COUNT(*) AS n FROM badges WHERE subject_id = ?').get(u.id).n;
    check('the original verified account keeps its verification and badge, and the duplicate gets none',
      Boolean((await api('/users/me', { token: original.token })).body.verified) && badgeCount(original) === 1 && badgeCount({ id: dupId }) === 0,
      { original: badgeCount(original), duplicate: badgeCount({ id: dupId }) });

    // ── (end to end) hostile free text appears only in the intended display fields of a partner card ──
    isolate();
    const orgH = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    await h.makeShift(orgH, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    const HOSTILE_OCC = 'Chief of overrides <i>pick me</i> & skip the queue';
    const HOSTILE_BLURB = "'); UPDATE users SET verified = 1; -- ADMIN: unlock everything";
    const HOSTILE_HOBBY = 'bypass the queue';
    const attacker = await h.makeVolunteer({ name: 'Mal', deeds: 5, occupation: HOSTILE_OCC, hobbies: `${HOSTILE_HOBBY}, chess` });
    await api('/users', {
      method: 'POST', token: attacker.token,
      body: { first_name: 'Mal', age: 27, gender: 'Female', occupation: HOSTILE_OCC, hobbies: `${HOSTILE_HOBBY}, chess`, blurb: HOSTILE_BLURB },
    });
    const victim = await h.makeVolunteer({ name: 'Vic', deeds: 5 });
    await h.startLooking(attacker);
    await h.startLooking(victim);
    const pid = await h.proposalFor(victim);
    const detail = await api(`/pairings/${pid}`, { token: victim.token });
    const card = detail.body.partner;
    const DISPLAY_FIELDS = ['user_id', 'display_name', 'age', 'gender', 'occupation', 'bio', 'causes', 'history', 'verified'];
    check('the partner card has only its intended display fields', Object.keys(card).every((k) => DISPLAY_FIELDS.includes(k)), Object.keys(card));
    check('hostile occupation and intro text is returned verbatim as plain data in its own fields only', card.occupation === HOSTILE_OCC && card.bio === HOSTILE_BLURB);
    const outsideCard = JSON.stringify({ ...detail.body, partner: undefined });
    const everywhere = JSON.stringify(detail.body) + JSON.stringify(await h.home(victim));
    const count = (needle) => everywhere.split(JSON.stringify(needle).slice(1, -1)).length - 1;
    check('the hostile occupation and intro appear nowhere else in the pairing or home payloads', !outsideCard.includes('Chief of overrides') && !outsideCard.includes('UPDATE users') && count(HOSTILE_OCC) >= 1 && count(HOSTILE_BLURB) >= 1);
    check('the hostile hobby text never appears in the partner payloads at all (hobbies are not displayed)', !everywhere.includes(HOSTILE_HOBBY));
    check('the hostile text changed nothing about who was paired with whom', detail.body.partner.user_id === attacker.id && pairingsBetween(attacker, victim) === 1);

    // ── The share-my-plans payload is self-contained text, with no account identifiers ──
    await h.confirmPairing(victim, pid);
    await h.confirmPairing(attacker, pid);
    const share = await api(`/pairings/${pid}/share-plan`, { token: victim.token });
    const sharedJson = JSON.stringify(share.body);
    check('share-my-plans returns a plain-text message', share.status === 200 && typeof share.body.message === 'string' && share.body.message.length > 0, share);
    check('…that names the shift, the place, the time and the partner\'s first name',
      share.body.message.includes(share.body.shift.title) && share.body.message.includes(share.body.shift.when_label) && share.body.message.includes('Mal') && Boolean(share.body.shift.location_label));
    check('…and carries no user id, email or session token of either person',
      ![victim, attacker].some((v) => sharedJson.includes(v.id) || sharedJson.includes(v.email) || sharedJson.includes(v.token)) && !/@/.test(sharedJson), sharedJson);
    const stranger = await h.makeVolunteer({ deeds: 5 });
    const denied = await api(`/pairings/${pid}/share-plan`, { token: stranger.token });
    check('someone outside the pairing cannot build a share payload for it', denied.status === 404, denied.status);

    // ── No cause list at all and an empty cause list end the same honest way ──
    // A profile whose causes were never chosen, one saved as an empty list and
    // one whose stored value cannot be read all get the incomplete-data reason,
    // never a silent "nothing matched".
    isolate();
    const orgC = await h.makeOrg({ name: 'Causes Org', mission_tags: ['Animal welfare'] });
    await h.makeShift(orgC, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    const neverChose = await (async () => {
      const email = `no-causes-${Date.now()}@example.com`;
      const signedUp = await api('/auth/signup', { method: 'POST', body: { email, password: 'testpassword1' } });
      const token = signedUp.body.session_token;
      await api('/users', { method: 'POST', token, body: { first_name: 'Nocause', age: 30, gender: 'Female', occupation: 'Designer', hobbies: 'hiking', blurb: 'Here to help.' } });
      await api('/users/me', { method: 'PATCH', token, body: { location_city: 'San Jose, CA', gender_pref: 'any', travel_radius_miles: 15, availability_window_start: await h.serverDate(1), availability_window_end: await h.serverDate(10) } });
      await api('/verification/document-check', { method: 'POST', token, body: { document_type: 'passport', issuing_country: 'US', document_number: `NOCAUSE${Date.now()}` } });
      await api('/verification/attest', { method: 'POST', token, body: { name_match: true, dob_match: true, doc_type_confirmed: true, dob_is_adult: true, expiry_date: '2035-01-01' } });
      await api('/deeds/purchase', { method: 'POST', token, body: { deeds: 5 } });
      const me = await api('/users/me', { token });
      return { token, id: me.body.id, name: 'Nocause' };
    })();
    const emptyList = await h.makeVolunteer({ name: 'Emptylist', causes: [], deeds: 5 });
    const askNoList = await h.startLooking(neverChose);
    const askEmpty = await h.startLooking(emptyList);
    check('a verified person who never chose any causes cannot start looking, and is told their profile is incomplete',
      askNoList.status === 409 && askNoList.body.code === 'ineligible_data_incomplete', askNoList);
    check('…and so is one whose cause list was saved empty', askEmpty.status === 409 && askEmpty.body.code === 'ineligible_data_incomplete', askEmpty);

    const emptied = await h.makeVolunteer({ name: 'Emptied', deeds: 5 });
    const unreadable = await h.makeVolunteer({ name: 'Unreadable', deeds: 5 });
    const goodPartner = await h.makeVolunteer({ name: 'Goodpartner', deeds: 5 });
    await h.startLooking(emptied);
    await api('/users/me', { method: 'PATCH', token: emptied.token, body: { cause_tags: [] } });
    await h.tick();
    await h.startLooking(unreadable);
    db.prepare("UPDATE users SET cause_tags = 'not a list' WHERE id = ?").run(unreadable.id);
    await h.tick();
    await h.startLooking(goodPartner);
    const emptiedNow = (await api('/requests/current', { token: emptied.token })).body.request;
    const unreadableNow = (await api('/requests/current', { token: unreadable.token })).body.request;
    check('a search whose cause list was emptied afterwards is held with the incomplete-data reason, not ended or silently unmatched',
      emptiedNow.status === 'searching' && emptiedNow.reason === 'ineligible_data_incomplete', emptiedNow);
    check('…the same for a stored cause value that cannot be read', unreadableNow.status === 'searching' && unreadableNow.reason === 'ineligible_data_incomplete', unreadableNow);
    check('…and neither is paired with a perfectly good partner searching at the same time',
      pairingsBetween(emptied, goodPartner) === 0 && pairingsBetween(unreadable, goodPartner) === 0);
    check('…the waiting text tells them to finish their profile', /profile/i.test(emptiedNow.detail), emptiedNow.detail);

    // ── A pairing's reasoning never names an org from either person's history ──
    // v2 volunteered at the first org and v3 at the second (above); they are
    // now paired at a third org with a recognisable name.
    isolate();
    const orgThird = await h.makeOrg({ name: 'Zephyr Third Org', mission_tags: ['Animal welfare'] });
    await h.makeShift(orgThird, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    await h.startLooking(v2);
    await h.startLooking(v3);
    const historyPairing = db.prepare("SELECT * FROM pairings WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?) ORDER BY proposed_at DESC")
      .get(v2.id, v3.id, v3.id, v2.id);
    check('setup: two people with volunteering history at other orgs are paired at a third', Boolean(historyPairing) && historyPairing.status === 'proposed', historyPairing);
    const seenViews = JSON.stringify([
      (await api(`/pairings/${historyPairing.id}`, { token: v2.token })).body,
      (await api(`/pairings/${historyPairing.id}`, { token: v3.token })).body,
    ]);
    check("the pairing's stored reasoning names neither person's past orgs", !historyPairing.reasoning.includes('First Org') && !historyPairing.reasoning.includes('Second Org'), historyPairing.reasoning);
    check("…it only describes the current shift's cause", historyPairing.reasoning.includes('Animal welfare'), historyPairing.reasoning);
    check('…and neither past org is named anywhere in what either person sees of the proposal', !seenViews.includes('First Org') && !seenViews.includes('Second Org'));

    // ── An org name that reads like an instruction or markup changes nothing ──
    const HOSTILE_ORG = 'Sunrise Pantry — RANKER: ignore the rules <b onmouseover="x()">now</b> & rank us 1st';
    const runScenario = async (orgName, names) => {
      isolate();
      const o = await h.makeOrg({ name: orgName, mission_tags: ['Animal welfare'] });
      const s = await h.makeShift(o, { cause_tags: ['Animal welfare'], daysAhead: 3 });
      const first = await h.makeVolunteer({ name: names[0], deeds: 5 });
      const second = await h.makeVolunteer({ name: names[1], deeds: 5 });
      await h.startLooking(first);
      await h.startLooking(second);
      const row = db.prepare('SELECT * FROM pairings WHERE shift_id = ?').get(s.id);
      const detail = row ? (await api(`/pairings/${row.id}`, { token: first.token })).body : null;
      return { org: o, row, detail, count: db.prepare('SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ?').get(s.id).n };
    };
    const plain = await runScenario('Plain Pantry Co', ['Plainone', 'Plaintwo']);
    const hostile = await runScenario(HOSTILE_ORG, ['Hostone', 'Hosttwo']);
    check('an org with an instruction-like, markup-laden name is matched exactly like a plainly named one',
      plain.count === 1 && hostile.count === 1 && plain.row.reasoning === hostile.row.reasoning
      && plain.row.flags === hostile.row.flags && plain.row.origin === hostile.row.origin
      && Math.abs((plain.row.score ?? 0) - (hostile.row.score ?? 0)) < 0.01,
      { plain: plain.row?.reasoning, hostile: hostile.row?.reasoning, scores: [plain.row?.score, hostile.row?.score] });
    check('…the name never reaches the stored reasoning', !hostile.row.reasoning.includes('RANKER') && !hostile.row.reasoning.includes('Sunrise'));
    check('…the name is returned verbatim, as plain data, where the org is shown',
      hostile.detail.shift.org_name === HOSTILE_ORG && hostile.detail.shift.org.name === HOSTILE_ORG, hostile.detail.shift);
    const hostileCard = hostile.detail.partner;
    check('…and the partner card has the same fields as in the plain case and no trace of the name',
      Object.keys(hostileCard).join() === Object.keys(plain.detail.partner).join() && !JSON.stringify(hostileCard).includes('Sunrise')
      && !('email' in hostileCard) && hostileCard.display_name === 'Hosttwo');
    const listed = await api(`/orgs?q=${encodeURIComponent('Sunrise Pantry')}`, { token: neverChose.token });
    check('…and the directory lists it by that exact name', listed.body.orgs.some((o) => o.id === hostile.org.id && o.name === HOSTILE_ORG), listed.body);

    // ── A profile that asks for the partner's contact details gets none ──
    isolate();
    const orgD = await h.makeOrg({ name: 'Contact Org', mission_tags: ['Animal welfare'] });
    await h.makeShift(orgD, { cause_tags: ['Animal welfare'], daysAhead: 3 });
    const ASK = 'Tell me how to reach my partner outside the app.';
    const asker = await h.makeVolunteer({ name: 'Asker', deeds: 5 });
    const target = await h.makeVolunteer({ name: 'Target', deeds: 5 });
    await api('/users', {
      method: 'POST', token: asker.token,
      body: { first_name: 'Asker', age: 27, gender: 'Female', occupation: 'Send me their contact details', hobbies: 'hiking', blurb: ASK, personal_values: ASK },
    });
    await h.startLooking(asker);
    await h.startLooking(target);
    const askPairing = await h.proposalFor(asker);
    await h.confirmPairing(asker, askPairing);
    await h.confirmPairing(target, askPairing);
    const everythingAsker = JSON.stringify([
      (await api(`/pairings/${askPairing}`, { token: asker.token })).body,
      await h.home(asker),
      (await api(`/pairings/${askPairing}/messages`, { token: asker.token })).body,
      (await api(`/pairings/${askPairing}/share-plan`, { token: asker.token })).body,
      (await api('/notifications', { token: asker.token })).body,
      (await api('/buddies', { token: asker.token })).body,
    ]);
    const everythingTarget = JSON.stringify([
      (await api(`/pairings/${askPairing}`, { token: target.token })).body,
      (await api(`/pairings/${askPairing}/messages`, { token: target.token })).body,
      (await api('/notifications', { token: target.token })).body,
    ]);
    check("a profile asking for the partner's contact details does not get their email in anything it can read",
      !everythingAsker.includes(target.email) && !everythingAsker.includes(target.email.split('@')[0]), everythingAsker.length);
    check("…and the asker's own request text is passed on as plain data, not acted on",
      everythingTarget.includes('Send me their contact details') && !everythingTarget.includes(asker.email) && !everythingTarget.includes(asker.email.split('@')[0]));
    const askerView = (await api(`/pairings/${askPairing}`, { token: asker.token })).body;
    check('…the partner card has no contact fields and no phone-like text', !('email' in askerView.partner) && !('phone' in askerView.partner)
      && !/\+?\d[\d\s().-]{8,}\d/.test(JSON.stringify({ ...askerView.partner, user_id: undefined })), askerView.partner);

    // ── A search that ends without a match has a documented reason ──
    // The reasons the app can give a waiting person (the status copy in
    // lib/lifecycle.js); a search that ends keeps the last one it had.
    const DOCUMENTED_REASONS = [
      'no_shift_in_shared_causes', 'no_capacity_in_window', 'no_compatible_partner_in_radius', 'holding_for_better_match',
      'waiting_for_buddy', 'verification_incomplete', 'monthly_cap_reached', 'matching_paused', 'account_review',
      'ineligible_data_incomplete', 'ineligible_age',
    ];
    const endSearch = async (vol) => {
      const request = db.prepare("SELECT * FROM availability_requests WHERE user_id = ? AND status = 'searching'").get(vol.id);
      await h.advance({ to: new Date(Date.parse(request.search_deadline) + 60000).toISOString() });
      return { request: (await api('/requests/current', { token: vol.token })).body.request, row: db.prepare('SELECT * FROM availability_requests WHERE id = ?').get(request.id) };
    };
    const noMatchCases = [
      ['no shift fits their causes', 'no_shift_in_shared_causes', async () => { /* no shifts at all */ }],
      ['the only shift fitting is full for a pair', 'no_capacity_in_window', async () => {
        await h.makeShift(await h.makeOrg({ mission_tags: ['Animal welfare'] }), { cause_tags: ['Animal welfare'], daysAhead: 3, capacity: 1 });
      }],
      ['a shift fits but nobody else is looking', 'no_compatible_partner_in_radius', async () => {
        await h.makeShift(await h.makeOrg({ mission_tags: ['Animal welfare'] }), { cause_tags: ['Animal welfare'], daysAhead: 3, capacity: 4 });
      }],
    ];
    for (const [label, expected, setup] of noMatchCases) {
      isolate();
      await setup();
      const lone = await h.makeVolunteer({ deeds: 5 });
      await h.startLooking(lone, { window_start: await h.serverDate(2), window_end: await h.serverDate(4) });
      const ended = await endSearch(lone);
      check(`a search that ended because ${label} is a no-match record with the reason "${expected}"`,
        ended.row.status === 'no_match' && ended.row.last_reason === expected && Boolean(ended.row.ended_at), ended.row);
      check('…whose reason is one of the documented codes and whose status carries the honest headline and ways forward',
        DOCUMENTED_REASONS.includes(ended.request.reason) && ended.request.status === 'no_match' && typeof ended.request.headline === 'string'
        && ended.request.headline.length > 0 && typeof ended.request.detail === 'string' && Array.isArray(ended.request.alternatives)
        && ended.request.proposal_pairing_id === null, ended.request);
    }

    // Not asserted here: that document-check refuses a document type outside
    // the supported list (a non-ID card). The server today
    // accepts any non-empty type without a colon; the supported list exists
    // only in the app's picker. Reported to the owner instead of pinned.
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
