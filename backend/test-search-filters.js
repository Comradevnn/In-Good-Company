// Search filters on a standard search: the weekdays the person is free (a hard
// filter judged on each shift's own local day), "any day, soonest first",
// a revived search starting with no match bar, and the Premium hobby filter.
// Own server on :3050 and own throwaway database (test-helpers.js).
const crypto = require('node:crypto');
const h = require('./test-helpers');

h.useTempDb('search-filters');
const { check, api } = h;
const rules = require('./lib/rules');

const weekdayOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const { monthKey, addDays } = require('./lib/time');
  const { haversineMiles } = require('./matching/engine');
  const causes = ['Animal welfare', 'Environmental cleanups'];
  const shiftOf = (vol) => db.prepare(`
    SELECT shift_id FROM pairings WHERE (user_a_id = ? OR user_b_id = ?) AND status IN ('proposed', 'confirmed') ORDER BY proposed_at DESC LIMIT 1
  `).get(vol.id, vol.id)?.shift_id ?? null;
  const pairingsBetween = (a, b) => db.prepare(`
    SELECT COUNT(*) AS n FROM pairings WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)
  `).get(a.id, b.id, b.id, a.id).n;
  const userRow = (vol) => db.prepare('SELECT * FROM users WHERE id = ?').get(vol.id);
  const requestRow = (vol) => db.prepare('SELECT * FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(vol.id);
  const current = async (vol) => (await api('/requests/current', { token: vol.token })).body.request;
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const volunteer = (name, extra = {}) => h.makeVolunteer({ name, deeds: 5, causes, ...extra });
  const search = (vol, extra = {}, opts = {}) => h.startLooking(vol, { ...opts, extra });
  const free = (vol) => db.prepare("UPDATE accounts SET created_at = datetime('now', '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)").run(vol.id);

  try {
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const dayEarly = await h.serverDate(2);
    const dayLate = await h.serverDate(3);
    const wdEarly = weekdayOf(dayEarly);
    const wdLate = weekdayOf(dayLate);
    const wdOther = [0, 1, 2, 3, 4, 5, 6].find((d) => d !== wdEarly && d !== wdLate);
    const early = await h.makeShift(org, { date: dayEarly, title: 'Early' });
    const late = await h.makeShift(org, { date: dayLate, title: 'Late' });

    // ── Any day, soonest first ──
    const s1 = await volunteer('Soon1');
    const s2 = await volunteer('Soon2');
    await search(s1);
    await search(s2);
    check('with no weekdays chosen, otherwise equal shifts: the sooner one is proposed', shiftOf(s1) === early.id && shiftOf(s2) === early.id, shiftOf(s1));
    const anyReq = await current(s1);
    check('the status reports no weekdays for an any-day search', anyReq.weekdays === null, anyReq.weekdays);
    check('…and nothing is stored on the request or the profile', requestRow(s1).weekdays === null && userRow(s1).availability_weekdays === null);

    // ── Weekday filter ──
    isolate();
    const early2 = await h.makeShift(org, { date: dayEarly, title: 'Early 2' });
    const late2 = await h.makeShift(org, { date: dayLate, title: 'Late 2' });
    const w1 = await volunteer('Day1');
    const w2 = await volunteer('Day2');
    const r1 = await search(w1, { weekdays: [wdLate] });
    check('a search with weekdays is accepted and reports them', r1.status === 201 && r1.body.weekdays?.join() === String(wdLate), r1.body);
    await search(w2, { weekdays: [wdLate] });
    check('only the shift on a chosen weekday is proposed, though an earlier one is in the window', shiftOf(w1) === late2.id && shiftOf(w2) === late2.id, [shiftOf(w1), early2.id, late2.id]);
    check('the weekdays are stored on the request', requestRow(w1).weekdays === JSON.stringify([wdLate]), requestRow(w1).weekdays);
    check('the weekdays are stored on the profile to pre-fill next time', userRow(w1).availability_weekdays === JSON.stringify([wdLate]), userRow(w1).availability_weekdays);

    // Several days, listed out of order: sorted, and any of them will do.
    isolate();
    const early3 = await h.makeShift(org, { date: dayEarly, title: 'Early 3' });
    const m1 = await volunteer('Multi1');
    const m2 = await volunteer('Multi2');
    await search(m1, { weekdays: [wdLate, wdEarly] });
    await search(m2, { weekdays: [wdEarly, wdLate] });
    check('any of several chosen weekdays can match (the sooner of them wins the tie)', shiftOf(m1) === early3.id && shiftOf(m2) === early3.id, shiftOf(m1));

    // A person who only wants a day with no shift waits; the other day's shift is not offered.
    isolate();
    await h.makeShift(org, { date: dayEarly, title: 'Early 4' });
    const n1 = await volunteer('Nope1');
    const n2 = await volunteer('Nope2');
    await search(n1, { weekdays: [wdOther] });
    await search(n2);
    check('a shift on another day in the window is skipped, so there is no pairing', pairingsBetween(n1, n2) === 0);
    check('…and the search is still open', (await current(n1)).status === 'searching');

    // ── Adjusting weekdays ──
    const a1 = n1;
    const adj = await api('/requests/current/adjust', { method: 'POST', token: a1.token, body: { weekdays: [wdEarly] } });
    check('adjusting the weekdays changes them', adj.status === 200 && adj.body.request.weekdays?.join() === String(wdEarly), adj.body);
    check('…and the profile pre-fill follows', userRow(a1).availability_weekdays === JSON.stringify([wdEarly]));
    check('…and matching re-runs with the new days', pairingsBetween(n1, n2) === 1);

    isolate();
    await h.makeShift(org, { date: dayEarly, title: 'Early 5' });
    const c1 = await volunteer('Clear1');
    const c2 = await volunteer('Clear2');
    await search(c1, { weekdays: [wdOther] });
    await search(c2);
    const clear = await api('/requests/current/adjust', { method: 'POST', token: c1.token, body: { weekdays: [] } });
    check('adjusting with an empty list clears the weekdays (any day)', clear.status === 200 && clear.body.request.weekdays === null, clear.body);
    check('…cleared on the request and the profile', requestRow(c1).weekdays === null && userRow(c1).availability_weekdays === null);
    check('…so the pair now matches', pairingsBetween(c1, c2) === 1);
    const stay = await volunteer('Stay');
    await search(stay, { weekdays: [wdEarly] });
    const badAdjust = await api('/requests/current/adjust', { method: 'POST', token: stay.token, body: { weekdays: [9] } });
    check('adjust refuses invalid weekdays', badAdjust.status === 400 && badAdjust.body.code === 'invalid_weekdays', badAdjust.body);
    const emptyWindow = await api('/requests/current/adjust', { method: 'POST', token: stay.token, body: { window_start: dayEarly, window_end: dayEarly, weekdays: [(wdEarly + 1) % 7] } });
    check('adjust refuses a window with none of the chosen days', emptyWindow.status === 400 && emptyWindow.body.code === 'no_weekday_in_window', emptyWindow.body);
    check('…and leaves the weekdays as they were', requestRow(stay).weekdays === JSON.stringify([wdEarly]));
    await api('/requests/current/cancel', { method: 'POST', token: stay.token });

    // ── Validation ──
    const v = await volunteer('Valid');
    const tryWeekdays = async (weekdays) => search(v, { weekdays });
    for (const [label, bad] of [['an out-of-range day', [7]], ['a negative day', [-1]], ['a repeated day', [1, 1]], ['a non-array', 'monday'],
      ['a fractional day', [1.5]], ['a string day', ['1']], ['more than seven days', [0, 1, 2, 3, 4, 5, 6, 0]]]) {
      const res = await tryWeekdays(bad);
      check(`invalid_weekdays: ${label}`, res.status === 400 && res.body.code === 'invalid_weekdays', res.body);
    }
    const none = await search(v, { window_start: dayEarly, window_end: dayLate, weekdays: [wdOther] });
    check('a window with none of the chosen days is refused with a plain message',
      none.status === 400 && none.body.code === 'no_weekday_in_window' && /days/.test(none.body.error ?? ''), none.body);
    check('a refused search leaves nothing behind', requestRow(v) == null && userRow(v).availability_weekdays === null);

    // ── Pre-fill from the profile when the body has no weekdays ──
    isolate();
    const p1 = await volunteer('Prefill');
    await search(p1, { weekdays: [wdLate] });
    await api('/requests/current/cancel', { method: 'POST', token: p1.token });
    const again = await search(p1);
    check('with no weekdays in the body, the profile\'s last choice is used', again.status === 201 && again.body.weekdays?.join() === String(wdLate), again.body);
    await api('/requests/current/cancel', { method: 'POST', token: p1.token });
    await search(p1, { weekdays: [] });
    check('an empty list in the body clears the profile choice', userRow(p1).availability_weekdays === null);
    await api('/requests/current/cancel', { method: 'POST', token: p1.token });

    // ── Shift's own timezone decides the day ──
    isolate();
    const nz = await h.makeShift(org, { date: dayLate, title: 'Auckland' });
    const startsAt = `${dayLate}T20:00:00.000Z`;
    db.prepare("UPDATE shifts SET timezone = 'Pacific/Auckland', starts_at = ?, ends_at = ? WHERE id = ?")
      .run(startsAt, `${dayLate}T22:00:00.000Z`, nz.id);
    const localDayNz = addDays(dayLate, 1); // 20:00 UTC is the next morning in Auckland
    const t1 = await volunteer('Zone1');
    const t2 = await volunteer('Zone2');
    await search(t1, { weekdays: [weekdayOf(dayLate)] });
    await search(t2, { weekdays: [weekdayOf(dayLate)] });
    check('a shift in another timezone is judged on its own local day (the platform-day weekday does not match)', pairingsBetween(t1, t2) === 0, localDayNz);
    await api('/requests/current/cancel', { method: 'POST', token: t1.token });
    await api('/requests/current/cancel', { method: 'POST', token: t2.token });
    const t3 = await volunteer('Zone3');
    const t4 = await volunteer('Zone4');
    await search(t3, { weekdays: [weekdayOf(localDayNz)] });
    await search(t4, { weekdays: [weekdayOf(localDayNz)] });
    check('…and matches when the shift\'s own local day is chosen', shiftOf(t3) === nz.id && shiftOf(t4) === nz.id, shiftOf(t3));

    // ── Solo RSVP and rematch searches ignore weekdays ──
    isolate();
    const soloShift = await h.makeShift(org, { date: dayLate, title: 'Solo' });
    const so = await volunteer('Solo1');
    const sp = await volunteer('Solo2');
    await search(so, { weekdays: [wdOther] });
    await api('/requests/current/cancel', { method: 'POST', token: so.token });
    const rsvp = await api(`/shifts/${soloShift.id}/rsvp-solo`, { method: 'POST', token: so.token });
    check('a solo RSVP is accepted on a day outside the profile\'s weekdays', rsvp.status === 201, rsvp.body);
    const soloReq = db.prepare("SELECT * FROM availability_requests WHERE user_id = ? AND kind = 'solo_rsvp'").get(so.id);
    check('the solo search carries no weekdays', soloReq && soloReq.weekdays === null, soloReq);
    // Even a weekdays value forced onto the anchored search must not be applied.
    db.prepare('UPDATE availability_requests SET weekdays = ? WHERE id = ?').run(JSON.stringify([wdOther]), soloReq.id);
    await search(sp);
    check('an anchored (solo or rematch) search is still paired onto its one shift', shiftOf(so) === soloShift.id && shiftOf(sp) === soloShift.id, shiftOf(so));
    const soloAdjust = await api('/requests/current/adjust', { method: 'POST', token: so.token, body: { weekdays: [wdLate] } });
    check('a solo search cannot be adjusted (so no weekdays can be put on it)', soloAdjust.status === 409 || soloAdjust.status === 404, soloAdjust.body);

    // ── Premium hobby filter ──
    isolate();
    await h.makeShift(org, { date: dayEarly, title: 'Hobby' });
    const freeUser = await volunteer('FreeHobby');
    free(freeUser);
    const denied = await search(freeUser, { hobby_filter: ['chess'] });
    check('a hobby filter is Premium only', denied.status === 403 && denied.body.code === 'premium_required', denied.body);
    const emptyOk = await search(freeUser, { hobby_filter: [] });
    check('an empty hobby filter is no filter, so a free user is not refused', emptyOk.status === 201, emptyOk.body);
    await api('/requests/current/cancel', { method: 'POST', token: freeUser.token });

    const prem = await volunteer('Chess', { hobbies: 'chess, cooking' });
    for (const [label, bad] of [['more than the allowed number', Array.from({ length: rules.HOBBY_FILTER_MAX + 1 }, (_, i) => `hobby${i}`)], ['a blank entry', ['chess', '  ']], ['an over-long entry', ['x'.repeat(rules.HOBBY_MAX_LENGTH + 1)]],
      ['a non-array', 'chess'], ['a non-string entry', [5]]]) {
      const res = await search(prem, { hobby_filter: bad });
      check(`invalid_hobby_filter: ${label}`, res.status === 400 && res.body.code === 'invalid_hobby_filter', res.body);
    }
    const noHobby = await volunteer('Baker', { hobbies: 'baking, running' });
    const plain = await volunteer('Plain', { hobbies: 'gardening' });
    const ok = await search(prem, { hobby_filter: ['  Chess ', 'chess', 'Kayaking'] });
    check('a Premium search with a hobby filter is accepted', ok.status === 201, ok.body);
    check('the filter is stored normalised and de-duplicated', requestRow(prem).hobby_filter === JSON.stringify(['chess', 'kayaking']), requestRow(prem).hobby_filter);
    await search(noHobby);
    check('a partner without any of the hobbies is never paired', pairingsBetween(prem, noHobby) === 0);
    await search(plain);
    check('…nor is anyone else who lacks them', pairingsBetween(prem, plain) === 0);
    check('the filter does not hold the others back: they pair with each other', pairingsBetween(noHobby, plain) === 1);
    const lateComer = await volunteer('Chess2', { hobbies: 'Chess , knitting' });
    await search(lateComer);
    check('a partner with one of the hobbies is paired (spaces and case ignored)', pairingsBetween(prem, lateComer) === 1);
    check('the status response does not leak anyone\'s hobbies', !JSON.stringify(await current(prem)).toLowerCase().includes('knitting'));

    // ── The "is anyone about" hint respects the search's own hobby filter ──
    isolate();
    const hintBase = { window_start: await h.serverDate(1), window_end: await h.serverDate(10), preference: 'best' };
    const hinter = await volunteer('HintChess', { hobbies: 'chess' });
    await search(hinter, { hobby_filter: ['kayaking'] }, hintBase);
    const other = await volunteer('HintBaker', { hobbies: 'baking' });
    await search(other, {}, hintBase);
    check('with a hobby filter, someone without those hobbies does not make a partner "likely"',
      (await current(hinter)).anyone_available === false);
    const unfiltered = await volunteer('HintPlain', { hobbies: 'chess' });
    await search(unfiltered, {}, hintBase);
    check('the same searcher with no filter does see a partner as likely', (await current(unfiltered)).anyone_available === true);
    const kayaker = await volunteer('HintKayak', { hobbies: ' Kayaking , knitting' });
    await search(kayaker, {}, hintBase);
    check('once someone shares one of the hobbies (spaces and case ignored), the hint turns on',
      (await current(hinter)).anyone_available === true);

    // ── Waiting-screen alternatives respect the chosen weekdays ──
    isolate();
    const altDay = await h.serverDate(3);
    const wdAlt = weekdayOf(altDay);
    const wrongDay = await h.serverDate(4);
    const rightDay = await h.serverDate(3 + 7);
    await h.makeShift(org, { date: wrongDay, title: 'Next day' });
    await h.makeShift(org, { date: rightDay, title: 'Next week' });
    const altWindow = { window_start: altDay, window_end: altDay, preference: 'anyone' };
    const noDays = await volunteer('AltAny');
    await search(noDays, {}, altWindow);
    const nearbyAny = (await current(noDays)).alternatives.find((a) => a.type === 'nearby_date');
    check('with no weekdays chosen, nearby dates starts at the soonest shift outside the window', nearbyAny?.window_start === wrongDay, nearbyAny);
    await api('/requests/current/cancel', { method: 'POST', token: noDays.token });
    const withDays = await volunteer('AltDays');
    await search(withDays, { weekdays: [wdAlt] }, altWindow);
    const nearby = (await current(withDays)).alternatives.find((a) => a.type === 'nearby_date');
    check('with weekdays chosen, nearby dates starts at the first shift on a chosen weekday',
      nearby?.window_start === rightDay && weekdayOf(nearby.window_start) === wdAlt, nearby);
    const take = await api('/requests/current/adjust', { method: 'POST', token: withDays.token, body: { window_start: nearby.window_start, window_end: nearby.window_end } });
    check('tapping that suggestion works (its window holds a chosen weekday)', take.status === 200, take.body);
    check('…and the search now covers that shift', requestRow(withDays).window_start <= rightDay && requestRow(withDays).window_end >= rightDay);
    await api('/requests/current/cancel', { method: 'POST', token: withDays.token });

    // Wider distance and added cause also only count shifts on a chosen weekday.
    isolate();
    const home = { lat: 37.3382, lng: -121.8863 };
    const nearOff = { lat: home.lat + 0.15, lng: home.lng };
    const farOn = { lat: home.lat + 0.3, lng: home.lng };
    await h.makeShift(org, { date: wrongDay, title: 'Near, wrong day', capacity: 6, cause_tags: ['Animal welfare', 'Youth mentorship'], ...nearOff });
    await h.makeShift(org, { date: altDay, title: 'Far, chosen day', capacity: 2, cause_tags: ['Animal welfare', 'Elder care'], ...farOn });
    const geo = await volunteer('AltGeo', { ...home, radius: 5, causes: ['Animal welfare'] });
    await search(geo, { weekdays: [wdAlt] }, { window_start: altDay, window_end: wrongDay, preference: 'anyone' });
    const alts = (await current(geo)).alternatives;
    const wider = alts.find((a) => a.type === 'widen_radius');
    check('widening the distance is sized for the shift on a chosen weekday, not a nearer one on another day',
      wider?.travel_radius_miles === Math.ceil(haversineMiles(home, farOn)), wider);
    check('adding a cause counts only shifts on a chosen weekday', alts.find((a) => a.type === 'add_cause')?.cause === 'Elder care', alts);
    await api('/requests/current/cancel', { method: 'POST', token: geo.token });

    // Solo RSVP suggestions inside the window also skip shifts on days the person did not choose.
    isolate();
    await h.makeShift(org, { date: wrongDay, title: 'Solo wrong day' });
    await h.makeShift(org, { date: altDay, title: 'Solo chosen day' });
    const soloVol = await volunteer('AltSolo', { causes: ['Animal welfare'] });
    await search(soloVol, { weekdays: [wdAlt] }, { window_start: altDay, window_end: wrongDay, preference: 'anyone' });
    const soloAlt = (await current(soloVol)).alternatives.find((a) => a.type === 'solo_rsvp');
    check('solo RSVP lists only shifts on a chosen weekday', soloAlt?.shifts.length === 1 && soloAlt.shifts[0].title === 'Solo chosen day', soloAlt);
    await api('/requests/current/cancel', { method: 'POST', token: soloVol.token });
    const soloAny = await volunteer('AltSoloAny', { causes: ['Animal welfare'] });
    await search(soloAny, {}, { window_start: altDay, window_end: wrongDay, preference: 'anyone' });
    const soloAnyAlt = (await current(soloAny)).alternatives.find((a) => a.type === 'solo_rsvp');
    check('with no weekdays chosen, solo RSVP lists shifts on every day in the window', soloAnyAlt?.shifts.length === 2, soloAnyAlt);
    await api('/requests/current/cancel', { method: 'POST', token: soloAny.token });

    // ── The monthly cap still applies with weekdays set ──
    isolate();
    const capped = await volunteer('Capped');
    free(capped);
    const anyShift = db.prepare('SELECT id FROM shifts LIMIT 1').get().id;
    for (let i = 0; i < 2; i++) {
      db.prepare(`
        INSERT INTO bookings (id, user_id, shift_id, kind, status, cap_month, created_at) VALUES (?, ?, ?, 'paired', 'attended', ?, ?)
      `).run(crypto.randomBytes(8).toString('hex'), capped.id, anyShift, monthKey(new Date(await h.serverNow())), new Date().toISOString());
    }
    const capRefused = await search(capped, { weekdays: [wdEarly, wdLate] });
    check('a free user at the monthly cap is refused even with weekdays chosen', capRefused.status === 409 && capRefused.body.code === 'monthly_cap_reached', capRefused.body);

    // ── A fresh search keeps its bar; a revived one starts with none ──
    isolate();
    const farDay = await h.serverDate(20);
    const far = await h.makeShift(org, { date: farDay, title: 'Far out' });
    const control1 = await volunteer('BarA');
    const control2 = await volunteer('BarB');
    const best = { window_start: await h.serverDate(1), window_end: await h.serverDate(30) };
    await search(control1, {}, { ...best, preference: 'best' });
    await search(control2, {}, { ...best, preference: 'best' });
    check('control: two fresh "best" searches are held for a shift a long way off', pairingsBetween(control1, control2) === 0);
    await api('/requests/current/cancel', { method: 'POST', token: control1.token });
    await api('/requests/current/cancel', { method: 'POST', token: control2.token });

    const rev = await volunteer('Revive');
    const partner = await volunteer('RevivePartner');
    await search(rev, {}, { ...best, preference: 'best' });
    const openAdjust = await api('/requests/current/adjust', { method: 'POST', token: rev.token, body: { travel_radius_miles: 20 } });
    check('adjusting a search that is still open does not drop its bar to nothing',
      openAdjust.status === 200 && requestRow(rev).pressure_floor < 1, requestRow(rev).pressure_floor);
    await h.advance({ days: 6 }); // past the 5-day limit, tick runs inside
    check('a "best" search that runs out ends with no match', (await current(rev))?.status === 'no_match', await current(rev));
    await search(partner, {}, { window_start: await h.serverDate(1), window_end: await h.serverDate(30), preference: 'anyone' });
    const revive = await api('/requests/current/adjust', { method: 'POST', token: rev.token, body: { travel_radius_miles: 25 } });
    check('adjusting it revives the search', revive.status === 200 && revive.body.request.status !== 'no_match', revive.body);
    check('a revived search is stored with no match bar (full search time used)', requestRow(rev).pressure_floor === 1, requestRow(rev).pressure_floor);
    const revivedPairing = db.prepare('SELECT * FROM pairings WHERE user_a_id = ? OR user_b_id = ?').get(rev.id, rev.id);
    check('…so it is paired for a shift more than a week out', revivedPairing?.shift_id === far.id
      && Date.parse((db.prepare('SELECT starts_at FROM shifts WHERE id = ?').get(far.id)).starts_at) - (await h.serverNow()) > 7 * 86400000, revivedPairing);
    check('…and the stored bar for that pairing is zero', JSON.parse(revivedPairing?.score_breakdown ?? '{}').match_bar === 0, revivedPairing?.score_breakdown);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
