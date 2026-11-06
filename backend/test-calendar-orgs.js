// Search calendar (GET /requests/calendar), the organization directory
// (GET /orgs, POST /users/me/preferred-org) and the org-cancelled view flags
// on pairing and booking views. Own throwaway database (see test-helpers.js).
const h = require('./test-helpers');

h.useTempDb('calendar-orgs');
const { check, api } = h;
const rules = require('./lib/rules');

async function main() {
  const { server } = await h.startServer();
  try {
    const db = require('./db');
    const org = await h.makeOrg({ name: 'Calendar Animal Haven', mission_tags: ['Animal welfare'] });
    const colourOf = async (vol, date, query = '') => {
      const res = await api(`/requests/calendar?from=${date}&to=${date}${query}`, { token: vol.token });
      return res.status === 200 ? res.body.days[0]?.colour : `status ${res.status}`;
    };

    const alex = await h.makeVolunteer({ name: 'Calalex', deeds: 5 });
    const searcher = await h.makeVolunteer({ name: 'Calsearcher', deeds: 5 });

    // ── Crafted days ──
    const day = (n) => h.serverDate(n);
    const [dRoomy, dNearlyFull, dBoundary, dSolo, dFar, dWrongCause, dUnverifiedOrg, dOverlap] =
      [await day(5), await day(6), await day(7), await day(8), await day(9), await day(10), await day(11), await day(12)];
    const dEmpty = await day(4);

    await h.makeShift(org, { daysAhead: 5, capacity: rules.CALENDAR_NEARLY_FULL_SPOTS + 4 });
    await h.makeShift(org, { daysAhead: 6, capacity: rules.CALENDAR_NEARLY_FULL_SPOTS });
    await h.makeShift(org, { daysAhead: 7, capacity: rules.CALENDAR_NEARLY_FULL_SPOTS + 1 });
    await h.makeShift(org, { daysAhead: 8, capacity: 1 });
    await h.makeShift(org, { daysAhead: 10, capacity: 6, cause_tags: ['Elder care'] });
    const hidden = await h.makeOrg({ name: 'Calendar Hidden Org', mission_tags: ['Animal welfare'], verified: false });
    await h.makeShift(hidden, { daysAhead: 11, capacity: 6 });
    const x = await h.makeShift(org, { daysAhead: 12, capacity: 6, start_time: '09:00', end_time: '11:30' });
    await h.makeShift(org, { daysAhead: 12, capacity: 6, start_time: '10:00', end_time: '12:00' });

    check('a day with no shift is red', await colourOf(alex, dEmpty) === 'red');
    check('a day whose only shift has one spot left is red (a pair needs two)', await colourOf(alex, dSolo) === 'red');
    check('a day whose only shift is for another cause is red', await colourOf(alex, dWrongCause) === 'red');
    check("an unverified org's shift never colours a day", await colourOf(alex, dUnverifiedOrg) === 'red');
    check('a fitting shift with nobody else searching is yellow', await colourOf(alex, dRoomy) === 'yellow');
    check('a nearly full shift with nobody else searching is yellow', await colourOf(alex, dNearlyFull) === 'yellow');

    // Another volunteer searching across those days makes a partner likely.
    const search = await h.startLooking(searcher, { window_start: dEmpty, window_end: dOverlap, preference: 'anyone' });
    check('the other volunteer is searching', search.status === 201 && search.body.status === 'searching', search.body);
    check('a roomy fitting shift with a compatible searcher is green', await colourOf(alex, dRoomy) === 'green');
    check('a shift just above the nearly-full limit with a searcher is green', await colourOf(alex, dBoundary) === 'green');
    check('a nearly full shift stays yellow even with a searcher', await colourOf(alex, dNearlyFull) === 'yellow');
    check('red days stay red with a searcher', await colourOf(alex, dEmpty) === 'red' && await colourOf(alex, dSolo) === 'red');
    check('the searcher sees their own day as yellow (they are not their own partner)', await colourOf(searcher, dRoomy) === 'yellow');

    // ── Shift inside the minimum lead never colours a day ──
    const soon = new Date((await h.serverNow()) + rules.MIN_LEAD_MS / 2);
    const lead = await h.makeShift(org, { daysAhead: 14, capacity: 6 });
    db.prepare('UPDATE shifts SET starts_at = ?, ends_at = ? WHERE id = ?')
      .run(soon.toISOString(), new Date(soon.getTime() + 2 * 3600 * 1000).toISOString(), lead.id);
    const { localDate } = require('./lib/time');
    check('a shift inside the minimum lead does not colour its day', await colourOf(alex, localDate(soon)) === 'red');

    // ── Own overlapping bookings ──
    const beforeRsvp = await colourOf(alex, dOverlap);
    check('before booking, the overlap day has fitting shifts', beforeRsvp !== 'red', beforeRsvp);
    const rsvp = await api(`/shifts/${x.id}/rsvp-solo`, { method: 'POST', token: alex.token });
    check('solo RSVP for the first shift works', rsvp.status === 201, rsvp.body);
    check('a day whose shifts all overlap my own booking is red', await colourOf(alex, dOverlap) === 'red');

    // ── Travel distance ──
    const near = await h.makeVolunteer({ name: 'Calnear', lat: 37.3382, lng: -121.8863, radius: 15 });
    const dOakland = await day(13);
    await h.makeShift(org, { daysAhead: 13, capacity: 6, lat: 37.8044, lng: -122.2712 });
    check('a shift outside my profile distance is red', await colourOf(near, dOakland) === 'red');
    check('a longer ?radius brings it in', await colourOf(near, dOakland, '&radius=60') !== 'red');
    check('an out-of-range radius is refused', (await api('/requests/calendar?radius=500', { token: near.token })).status === 400);

    // ── Callers without causes or verification ──
    const noCauses = await h.makeVolunteer({ name: 'Calbare', causes: [] });
    const bare = await api(`/requests/calendar?from=${dRoomy}&to=${dBoundary}`, { token: noCauses.token });
    check('a user with no causes gets all red', bare.status === 200 && bare.body.days.every((d) => d.colour === 'red'), bare.body);
    const unverified = await h.makeVolunteer({ name: 'Calunverified', verify: false });
    const browsing = await api(`/requests/calendar?from=${dRoomy}&to=${dRoomy}`, { token: unverified.token });
    check('an unverified user can browse the calendar (never green: no partner can be paired with them)',
      browsing.status === 200 && browsing.body.days[0].colour === 'yellow', browsing.body);
    check('the calendar needs sign-in', (await api('/requests/calendar')).status === 401);

    // ── Response shape and range rules ──
    const wide = await api(`/requests/calendar?from=${dRoomy}&to=${dOverlap}`, { token: alex.token });
    check('the response has only a days list', Object.keys(wide.body).join() === 'days', Object.keys(wide.body));
    check('each day has only date and colour', wide.body.days.every((d) => Object.keys(d).sort().join() === 'colour,date'
      && ['red', 'yellow', 'green'].includes(d.colour)));
    check('days come back in order, one per date', wide.body.days.length === 8 && wide.body.days[0].date === dRoomy && wide.body.days[7].date === dOverlap);
    const dflt = await api('/requests/calendar', { token: alex.token });
    check('with no dates it covers today and the default span', dflt.status === 200
      && dflt.body.days.length === rules.CALENDAR_DEFAULT_SPAN_DAYS + 1 && dflt.body.days[0].date === await day(0), dflt.body.days?.length);
    const past = await api(`/requests/calendar?from=${await day(-5)}&to=${await day(2)}`, { token: alex.token });
    check('past days are left out', past.status === 200 && past.body.days.length === 3 && past.body.days[0].date === await day(0), past.body);
    const allPast = await api(`/requests/calendar?from=${await day(-9)}&to=${await day(-3)}`, { token: alex.token });
    check('a range wholly in the past is an empty list', allPast.status === 200 && allPast.body.days.length === 0, allPast.body);
    const longest = await api(`/requests/calendar?from=${await day(0)}&to=${await day(rules.CALENDAR_MAX_RANGE_DAYS - 1)}`, { token: alex.token });
    check('the longest allowed range works', longest.status === 200 && longest.body.days.length === rules.CALENDAR_MAX_RANGE_DAYS, longest.status);
    const refuse = async (label, query) => {
      const res = await api(`/requests/calendar?${query}`, { token: alex.token });
      check(label, res.status === 400 && res.body.code === 'invalid_range', res.body);
    };
    await refuse('a range over the maximum is refused', `from=${await day(0)}&to=${await day(rules.CALENDAR_MAX_RANGE_DAYS)}`);
    await refuse('an end before the start is refused', `from=${await day(3)}&to=${await day(1)}`);
    await refuse('a made-up date is refused', 'from=2026-02-31&to=2026-03-05');
    await refuse('a non-date is refused', 'from=soon&to=later');
    await refuse('an array of dates is refused', `from=${await day(1)}&from=${await day(2)}`);

    await api('/requests/current/cancel', { method: 'POST', token: searcher.token });

    // ── Organization directory ──
    const stamp = Date.now().toString(36);
    const pantry = await h.makeOrg({ name: `Harbor Pantry ${stamp}`, mission_tags: ['Food banks & shelters'] });
    const hospice = await h.makeOrg({ name: `harbor hospice ${stamp}`, mission_tags: ['Elder care'] });
    const pending = await h.makeOrg({ name: `Harbor Pending ${stamp}`, mission_tags: ['Elder care'], verified: false });
    const search1 = await api(`/orgs?q=HARBOR`, { token: alex.token });
    const ids = (res) => res.body.orgs.map((o) => o.id);
    check('search is case-insensitive and finds verified orgs', ids(search1).includes(pantry.id) && ids(search1).includes(hospice.id), search1.body);
    check('an unverified org is never listed', !ids(search1).includes(pending.id));
    const names = search1.body.orgs.map((o) => o.name.toLowerCase());
    check('search is ordered by name', names.join() === [...names].sort().join(), names);
    const entry = search1.body.orgs.find((o) => o.id === pantry.id);
    check('an entry has only id, name, mission tags and place', Object.keys(entry).sort().join() === 'id,location_label,mission_tags,name'
      && Array.isArray(entry.mission_tags) && entry.mission_tags[0] === 'Food banks & shelters', entry);
    const everything = JSON.stringify(search1.body) + JSON.stringify((await api('/orgs', { token: alex.token })).body);
    check('the directory carries nothing about volunteers',
      ![alex, searcher, near].some((v) => everything.includes(v.name) || everything.includes(v.email) || everything.includes(v.id)));
    check('a wildcard character is matched literally, not as a wildcard', (await api('/orgs?q=%25', { token: alex.token })).body.orgs.length === 0);
    check('a name that matches nothing gives an empty list', (await api('/orgs?q=zzzznomatch', { token: alex.token })).body.orgs.length === 0);
    const insert = db.prepare("INSERT INTO orgs (name, mission_tags, location_label, verified, created_at) VALUES (?, '[]', 'Nowhere', 1, datetime('now'))");
    for (let i = 0; i < rules.ORG_DIRECTORY_MAX_RESULTS + 5; i++) insert.run(`Zed bulk ${String(i).padStart(2, '0')} ${stamp}`);
    const many = await api('/orgs', { token: alex.token });
    check('with no query it lists at most the maximum, by name', many.status === 200 && many.body.orgs.length === rules.ORG_DIRECTORY_MAX_RESULTS
      && many.body.orgs.map((o) => o.name.toLowerCase()).join() === [...many.body.orgs.map((o) => o.name.toLowerCase())].sort().join(), many.body.orgs.length);
    check('a query is capped at the maximum too', (await api(`/orgs?q=zed%20bulk`, { token: alex.token })).body.orgs.length === rules.ORG_DIRECTORY_MAX_RESULTS);
    check('the directory needs sign-in', (await api('/orgs')).status === 401);
    const byId = await api(`/orgs/${pantry.id}`, { token: alex.token });
    check('GET /orgs/:id still works beside the directory', byId.status === 200 && byId.body.org.id === pantry.id, byId.status);
    check("an org's own /orgs/mine still works", (await api('/orgs/mine', { token: pantry.token })).status === 200);

    // ── Preferred org ──
    const dana = await h.makeVolunteer({ name: 'Caldana', causes: ['Elder care'] });
    const pref = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: pantry.id } });
    check('choosing an org sets it on the profile', pref.status === 200 && pref.body.preferred_org_id === pantry.id, pref.body);
    check("the org's causes are merged in with none removed",
      JSON.stringify(JSON.parse(pref.body.cause_tags)) === JSON.stringify(['Elder care', 'Food banks & shelters']), pref.body.cause_tags);
    check('the reply is the own profile without internal columns', pref.body.id === dana.id && !('flagged_users' in pref.body) && !('duplicate_document' in pref.body));
    const again = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: pantry.id } });
    check('choosing the same org again adds no duplicates', JSON.parse(again.body.cause_tags).length === 2, again.body.cause_tags);
    const overlap = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: hospice.id } });
    check('an org sharing a cause adds no duplicate', JSON.stringify(JSON.parse(overlap.body.cause_tags)) === JSON.stringify(['Elder care', 'Food banks & shelters']), overlap.body.cause_tags);
    db.prepare('UPDATE orgs SET mission_tags = ? WHERE id = ?').run(JSON.stringify(['Animal welfare', 'Basket weaving']), pantry.id);
    const odd = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: pantry.id } });
    check('only valid cause labels are merged', JSON.parse(odd.body.cause_tags).includes('Animal welfare') && !JSON.parse(odd.body.cause_tags).includes('Basket weaving'), odd.body.cause_tags);
    const before = JSON.stringify(JSON.parse((await api('/users/me', { token: dana.token })).body.cause_tags));
    const refused = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: pending.id } });
    check('an unverified org is refused', refused.status === 404 && refused.body.code === 'org_not_found', refused.body);
    const missing = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: 'nope' } });
    check('an unknown org is refused', missing.status === 404 && missing.body.code === 'org_not_found', missing.body);
    const after = (await api('/users/me', { token: dana.token })).body;
    check('a refusal changes neither the choice nor the causes', after.preferred_org_id === pantry.id && JSON.stringify(JSON.parse(after.cause_tags)) === before);
    const cleared = await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: { org_id: null } });
    check('clearing removes the choice and leaves causes alone', cleared.status === 200 && cleared.body.preferred_org_id === null
      && JSON.stringify(JSON.parse(cleared.body.cause_tags)) === before, cleared.body);
    check('a missing org_id is a 400', (await api('/users/me/preferred-org', { method: 'POST', token: dana.token, body: {} })).status === 400);
    check('an org account cannot set a preferred org', (await api('/users/me/preferred-org', { method: 'POST', token: pantry.token, body: { org_id: hospice.id } })).status === 404);
    check('setting a preferred org needs sign-in', (await api('/users/me/preferred-org', { method: 'POST', body: { org_id: hospice.id } })).status === 401);

    // ── View flags for org-cancelled shifts ──
    const pairOrg = await h.makeOrg({ name: 'Calendar Flags Org', mission_tags: ['Elder care'] });
    const flagShift = await h.makeShift(pairOrg, { daysAhead: 3, capacity: 4, cause_tags: ['Elder care'] });
    const p1 = await h.makeVolunteer({ name: 'Calpairone', causes: ['Elder care'], deeds: 5 });
    const p2 = await h.makeVolunteer({ name: 'Calpairtwo', causes: ['Elder care'], deeds: 5, gender: 'Male' });
    await h.startLooking(p1, { window_start: await day(1), window_end: await day(4) });
    await h.startLooking(p2, { window_start: await day(1), window_end: await day(4) });
    const pairingId = await h.proposalFor(p1);
    check('two volunteers were paired for the flag checks', Boolean(pairingId));
    await h.confirmPairing(p1, pairingId);
    await h.confirmPairing(p2, pairingId);
    const pairing = (await api(`/pairings/${pairingId}`, { token: p1.token })).body;
    check('a live pairing is not flagged as cancelled', pairing.shift_cancelled === false && pairing.cancelled_by_org === false, pairing);
    const home1 = await h.home(p1);
    const bookingId = home1.bookings[0].booking_id;
    check('upcoming bookings carry shift_cancelled false', home1.bookings.every((b) => b.shift_cancelled === false));
    check('a booking view carries shift_cancelled false and a pairing flag',
      (await api(`/bookings/${bookingId}`, { token: p1.token })).body.shift_cancelled === false
      && home1.bookings[0].pairing?.cancelled_by_org === false, home1.bookings[0]);

    // The org's cancel itself is built elsewhere; craft its resulting rows.
    const pairingRow = db.prepare('SELECT * FROM pairings WHERE id = ?').get(pairingId);
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE id = ?").run(pairingRow.shift_id);
    db.prepare("UPDATE pairings SET status = 'cancelled' WHERE id = ?").run(pairingId);
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id IN (?, ?)").run(pairingRow.booking_a_id, pairingRow.booking_b_id);
    const cancelled = (await api(`/pairings/${pairingId}`, { token: p1.token })).body;
    check('an org-cancelled pairing is flagged', cancelled.shift_cancelled === true && cancelled.cancelled_by_org === true, cancelled);
    check('no bail decision is shown for it', cancelled.bail === null);
    const home2 = await h.home(p1);
    check('home offers no bail decision for it', !home2.actions.some((a) => a.type === 'bail_decision'), home2.actions);
    const cancelledBooking = (await api(`/bookings/${bookingId}`, { token: p1.token })).body;
    check('its booking view says the shift was cancelled', cancelledBooking.shift_cancelled === true, cancelledBooking);
    // A person backing out is not an org cancel, even if the shift later is cancelled.
    db.prepare("UPDATE pairings SET backed_out_by = ?, bail_user_id = ?, bail_deadline = ? WHERE id = ?")
      .run(p2.id, p1.id, new Date((await h.serverNow()) + rules.BAIL_DECISION_MS).toISOString(), pairingId);
    const backedOut = (await api(`/pairings/${pairingId}`, { token: p1.token })).body;
    check('a pairing someone backed out of is not flagged as org-cancelled', backedOut.cancelled_by_org === false, backedOut);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
