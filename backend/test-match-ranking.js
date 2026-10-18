// Soft ranking through the real HTTP flow: a run that sees the whole pool
// pairs by fit, a search near its deadline is served first, a user's own
// private fit ratings steer their shift choice, early bookings wait for a
// match that clears the bar unless both chose "anyone", and the score and
// its breakdown stay admin-only. Own server on :3050, own throwaway database.
const crypto = require('node:crypto');
const h = require('./test-helpers');

h.useTempDb('ranking');
const { check, api } = h;

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
  const pairingOf = (v) => db.prepare("SELECT * FROM pairings WHERE (user_a_id = ? OR user_b_id = ?) AND status = 'proposed' ORDER BY proposed_at DESC LIMIT 1").get(v.id, v.id);
  const causes = ['Elder care', 'Youth mentorship'];

  try {
    const org = await h.makeOrg({ mission_tags: ['Elder care'] });

    // ── Whole pool: fit beats arrival order ──
    isolate();
    const A = await h.makeVolunteer({ name: 'Ari', age: 24, hobbies: 'chess, music, hiking', causes, deeds: 5 });
    const C = await h.makeVolunteer({ name: 'Cal', age: 58, hobbies: 'golf, birding', causes, deeds: 5 });
    const B = await h.makeVolunteer({ name: 'Bea', age: 25, hobbies: 'chess, music, hiking', causes, deeds: 5 });
    const D = await h.makeVolunteer({ name: 'Dot', age: 57, hobbies: 'golf, birding', causes, deeds: 5 });
    for (const v of [A, C, B, D]) await h.startLooking(v); // no shift yet: everyone waits
    check('fixture: nobody is paired before a shift exists', [A, B, C, D].every((v) => !pairingOf(v)));
    await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 3, capacity: 4 }); // one run sees all four
    check('a run that sees the whole pool pairs people by fit, not just by arrival order',
      pairingsBetween(A, B) === 1 && pairingsBetween(C, D) === 1 && pairingsBetween(A, C) === 0);

    // ── Near its deadline: served first ──
    isolate();
    const L = await h.makeVolunteer({ name: 'Lee', age: 66, hobbies: 'birding', causes, deeds: 5 });
    await h.startLooking(L);
    const now = await h.serverNow();
    db.prepare("UPDATE availability_requests SET created_at = ?, search_deadline = ? WHERE user_id = ? AND status = 'searching'")
      .run(new Date(now - 3 * 86400000).toISOString(), new Date(now + 10 * 3600000).toISOString(), L.id);
    const H1 = await h.makeVolunteer({ name: 'Hal', age: 27, hobbies: 'chess, music, hiking', causes, deeds: 5 });
    const H2 = await h.makeVolunteer({ name: 'Hana', age: 27, hobbies: 'chess, music, hiking', causes, deeds: 5 });
    await h.startLooking(H1);
    await h.startLooking(H2);
    await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 2, capacity: 2 });
    check('a search close to giving up is served before a better-fitting fresh pair',
      pairingsBetween(L, H1) + pairingsBetween(L, H2) === 1 && pairingsBetween(H1, H2) === 0);

    // ── A user's own fit rating steers their shift choice ──
    isolate();
    const orgLiked = await h.makeOrg({ mission_tags: ['Elder care'] });
    await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 3 });
    const laterLiked = await h.makeShift(orgLiked, { cause_tags: ['Elder care'], daysAhead: 5 });
    const Z = await h.makeVolunteer({ name: 'Zed', causes, deeds: 5 });
    const W = await h.makeVolunteer({ name: 'Wren', causes, deeds: 5 });
    await h.startLooking(Z);
    await h.startLooking(W);
    const control = pairingOf(Z);
    check('fixture: with no ratings the earlier shift is chosen', control && control.shift_id !== laterLiked.id);
    const X = await h.makeVolunteer({ name: 'Xan', causes, deeds: 5 });
    for (let i = 0; i < 6; i++) {
      db.prepare(`INSERT INTO volunteer_org_ratings (booking_id, user_id, org_id, shift_id, operational, personal_fit, created_at)
        VALUES (?, ?, ?, ?, 4, 5, ?)`).run(crypto.randomBytes(8).toString('hex'), X.id, orgLiked.id, laterLiked.id, new Date().toISOString());
    }
    const Y = await h.makeVolunteer({ name: 'Yui', causes, deeds: 5 });
    await h.startLooking(X);
    await h.startLooking(Y);
    check("a user's own high personal-fit rating for an org tips the shift choice toward it", pairingOf(X)?.shift_id === laterLiked.id, pairingOf(X));

    // ── Explain output is admin-only ──
    const pairing = pairingOf(X);
    const asAdmin = await api(`/admin/pairings/${pairing.id}/score`, { admin: true });
    check('the stored score breakdown is visible to the admin',
      asAdmin.status === 200 && typeof asAdmin.body.score === 'number' && asAdmin.body.breakdown?.config_version && asAdmin.body.breakdown?.components, asAdmin.body);
    const asVolunteer = await api(`/admin/pairings/${pairing.id}/score`, { token: X.token });
    const asOrg = await api(`/admin/pairings/${pairing.id}/score`, { token: orgLiked.token });
    const previewAsVolunteer = await api('/admin/matching/preview', { token: X.token });
    check('…and to nobody else (volunteer and org tokens are refused)',
      [asVolunteer, asOrg, previewAsVolunteer].every((r) => r.status === 401 || r.status === 403), [asVolunteer.status, asOrg.status, previewAsVolunteer.status]);
    check('an unknown pairing id is a 404', (await api('/admin/pairings/nope/score', { admin: true })).status === 404);
    check('the explain routes are not reachable under /dev', (await api(`/dev/pairings/${pairing.id}/score`, { admin: true })).status === 404);

    // ── Preview writes nothing ──
    isolate();
    const shiftP = await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 4, capacity: 4 });
    const P1 = await h.makeVolunteer({ name: 'Pia', causes, deeds: 5 });
    const P2 = await h.makeVolunteer({ name: 'Pat', causes, deeds: 5 });
    const nowP = await h.serverNow();
    for (const v of [P1, P2]) {
      // Written straight to the DB so no matching run happens before the preview.
      db.prepare(`INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, status, search_deadline, created_at)
        VALUES (?, ?, 'standard', ?, ?, 15, 'searching', ?, ?)`).run(crypto.randomBytes(8).toString('hex'), v.id, await h.serverDate(1), await h.serverDate(10),
        new Date(nowP + 3 * 86400000).toISOString(), new Date(nowP).toISOString());
    }
    const before = { pairings: db.prepare('SELECT COUNT(*) AS n FROM pairings').get().n, booked: db.prepare('SELECT capacity_booked FROM shifts WHERE id = ?').get(shiftP.id).capacity_booked };
    const preview = await api('/admin/matching/preview', { admin: true });
    const after = { pairings: db.prepare('SELECT COUNT(*) AS n FROM pairings').get().n, booked: db.prepare('SELECT capacity_booked FROM shifts WHERE id = ?').get(shiftP.id).capacity_booked };
    check('the admin preview ranks candidates without creating any pairing or taking capacity',
      preview.status === 200 && preview.body.planned.length === 1 && preview.body.planned[0].shift_id === shiftP.id && preview.body.planned[0].breakdown?.quality != null
      && before.pairings === after.pairings && before.booked === after.booked, { body: preview.body, before, after });
    check('the preview carries ids only, never names', !JSON.stringify(preview.body).includes('Pia') && !JSON.stringify(preview.body).includes('Pat'));

    // ── The match bar: early bookings wait for a better match ──
    isolate();
    const reasonOf = (v) => db.prepare("SELECT last_reason FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(v.id)?.last_reason;
    const E1 = await h.makeVolunteer({ name: 'Eve', causes, deeds: 5 });
    const E2 = await h.makeVolunteer({ name: 'Eli', causes, deeds: 5 });
    check('fixture: nobody else searching means "anyone" is not offered', (await h.home(E1)).match_options.anyone_available === false);
    await h.startLooking(E1, { preference: 'best' });
    check('…and once a compatible person is searching, it is offered', (await h.home(E2)).match_options.anyone_available === true);
    await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 8 });
    await h.startLooking(E2, { preference: 'best' });
    check('a good pair for a shift a week or more out waits for a better match', pairingsBetween(E1, E2) === 0 && reasonOf(E1) === 'holding_for_better_match', reasonOf(E1));
    const waiting = (await api('/requests/current', { token: E1.token })).body.request;
    check('…and the waiting screen says we are taking our time', waiting.reason === 'holding_for_better_match' && /taking our time/.test(waiting.detail) && waiting.match_preference === 'best', waiting);
    await h.advance({ days: 4 });
    check('as the shift gets closer the bar falls and the same pair is matched', pairingsBetween(E1, E2) === 1);

    isolate();
    await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 8 });
    const F1 = await h.makeVolunteer({ name: 'Fay', causes, deeds: 5 });
    const F2 = await h.makeVolunteer({ name: 'Fin', causes, deeds: 5 });
    await h.startLooking(F1, { preference: 'best' });
    await h.startLooking(F2, { preference: 'anyone' });
    check('if only one of the two chose "anyone", the other\'s standard still applies', pairingsBetween(F1, F2) === 0);
    const switched = await api('/requests/current/adjust', { method: 'POST', token: F1.token, body: { match_preference: 'anyone' } });
    check('switching to "anyone" while waiting pairs them straight away', switched.status === 200 && pairingsBetween(F1, F2) === 1, switched.body);
    const badPref = await api('/requests', { method: 'POST', token: (await h.makeVolunteer({ causes, deeds: 5 })).token, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(10), match_preference: 'soon' } });
    check('an unknown match preference is refused', badPref.status === 400 && badPref.body.code === 'invalid_match_preference', badPref.body);
    const m = (await api('/admin/metrics', { admin: true })).body.searches_by_match_preference;
    check('admin metrics split searches and pairing scores by match preference', m?.best?.by_status && m?.anyone?.by_status && typeof m.anyone.avg_pairing_score === 'number', m);

    // ── Adjusting a search never raises its match bar ──
    const adjustScenario = async (label, { dropFloor }) => {
      isolate();
      const G1 = await h.makeVolunteer({ name: `${label}1`, age: 24, hobbies: 'hiking', causes, deeds: 5 });
      const G2 = await h.makeVolunteer({ name: `${label}2`, age: 62, hobbies: 'chess', causes, deeds: 5 });
      await h.startLooking(G1, { preference: 'best', window_end: await h.serverDate(40) });
      await h.advance({ days: 4, hours: 12 }); // most of the search's allowed time is used
      await h.makeShift(org, { cause_tags: ['Elder care'], daysAhead: 14 });
      const adjusted = await api('/requests/current/adjust', { method: 'POST', token: G1.token, body: { travel_radius_miles: 20 } });
      if (dropFloor) db.prepare('UPDATE availability_requests SET pressure_floor = NULL WHERE user_id = ?').run(G1.id);
      await h.startLooking(G2, { preference: 'anyone', window_end: await h.serverDate(40) });
      return { adjusted, G1, G2 };
    };
    const kept = await adjustScenario('Kit', { dropFloor: false });
    check('a search near its end that is adjusted can still be matched', kept.adjusted.status === 200 && pairingsBetween(kept.G1, kept.G2) === 1, kept.adjusted.body);
    const floorRow = db.prepare('SELECT pressure_floor FROM availability_requests WHERE user_id = ?').get(kept.G1.id);
    check('…because the adjustment stored how much of its time the search had used', floorRow.pressure_floor > 0.5 && floorRow.pressure_floor <= 1, floorRow);
    const lost = await adjustScenario('Lou', { dropFloor: true });
    check('control: without the stored floor the same adjusted search would be held back', pairingsBetween(lost.G1, lost.G2) === 0 && reasonOf(lost.G1) === 'holding_for_better_match', reasonOf(lost.G1));

    // ── "Match me with anyone" is only offered when a partner could really be paired ──
    const SJ_HOME = { lat: 37.3382, lng: -121.8863 };
    const NYC_HOME = { lat: 40.7128, lng: -74.006 };
    const offered = async (searcherOpts, mutate) => {
      isolate();
      const me = await h.makeVolunteer({ name: 'Me', causes, deeds: 5, ...SJ_HOME });
      const other = await h.makeVolunteer({ name: 'Other', causes, deeds: 5, ...SJ_HOME, ...searcherOpts });
      await h.startLooking(other, { preference: 'best' });
      if (mutate) mutate(other);
      return (await h.home(me)).match_options.anyone_available;
    };
    check('an eligible nearby searcher makes "anyone" available', await offered({}) === true);
    check('a searcher whose account is under review does not', await offered({}, (o) => db.prepare('UPDATE users SET account_review = 1, review_reason = ? WHERE id = ?').run('staff', o.id)) === false);
    const serverMs = await h.serverNow();
    check('a searcher in a temporary matching pause does not',
      await offered({}, (o) => db.prepare('UPDATE users SET matching_paused_until = ? WHERE id = ?').run(new Date(serverMs + 14 * 86400000).toISOString(), o.id)) === false);
    check('a searcher whose gender preference rules the caller out does not', await offered({ gender: 'Male', gender_pref: 'same_gender_only' }) === false);
    check('a searcher living far outside both travel radii does not', await offered({ ...NYC_HOME }) === false);
    const SANTA_CRUZ_HOME = { lat: 36.9741, lng: -122.0308 };
    check('a searcher a little beyond the caller\'s radius but with a wider radius of their own still counts', await offered({ ...SANTA_CRUZ_HOME, radius: 60 }) === true);
    check('…and one beyond both radii does not', await offered({ ...SANTA_CRUZ_HOME, radius: 5 }) === false);
    isolate();
    const asker = await h.makeVolunteer({ name: 'Ask', causes, deeds: 5, ...SJ_HOME });
    const helper = await h.makeVolunteer({ name: 'Help', causes, deeds: 5, ...SJ_HOME });
    await h.startLooking(helper, { preference: 'best' });
    await h.startLooking(asker, { preference: 'best' });
    const askerHome = await h.home(asker);
    check('someone who already has a search open is not sent a second prediction in match_options',
      askerHome.match_options.anyone_available === false && askerHome.request?.status === 'searching' && askerHome.request.anyone_available === true, askerHome.match_options);

    // ── Metrics count each pairing once and leave buddy searches out ──
    const pairingRows = db.prepare(`
      SELECT p.id, p.score, ar.match_preference AS pref FROM pairings p
      JOIN availability_requests ar ON ar.id IN (p.request_a_id, p.request_b_id)
      WHERE p.score IS NOT NULL AND ar.kind = 'standard' AND ar.buddy_user_id IS NULL
    `).all();
    const expectedAvg = (pref) => {
      const byPairing = new Map(pairingRows.filter((r) => r.pref === pref).map((r) => [r.id, r.score]));
      return byPairing.size ? [...byPairing.values()].reduce((a, b) => a + b, 0) / byPairing.size : null;
    };
    const buddyCountBefore = (await api('/admin/metrics', { admin: true })).body.searches_by_match_preference;
    db.prepare(`INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, buddy_user_id, match_preference, status, search_deadline, created_at)
      VALUES (?, ?, 'standard', ?, ?, 15, ?, 'best', 'cancelled', ?, ?)`).run(crypto.randomBytes(8).toString('hex'), asker.id, await h.serverDate(1), await h.serverDate(10), helper.id,
      new Date(Date.now() + 86400000).toISOString(), new Date().toISOString());
    const mAfter = (await api('/admin/metrics', { admin: true })).body.searches_by_match_preference;
    check('a buddy search is left out of both preference groups', JSON.stringify(mAfter) === JSON.stringify(buddyCountBefore), { buddyCountBefore, mAfter });
    check('each pairing counts once in the average fit of its preference group',
      ['best', 'anyone'].every((pref) => Math.abs((mAfter[pref]?.avg_pairing_score ?? 0) - (expectedAvg(pref) ?? 0)) < 0.0006), { mAfter, best: expectedAvg('best'), anyone: expectedAvg('anyone') });

    // ── Nothing volunteer-facing carries the score ──
    const leaks = [];
    for (const path of [`/pairings/${pairing.id}`, '/me/home', '/requests/current', '/users/me']) {
      const body = JSON.stringify((await api(path, { token: X.token })).body);
      for (const word of ['"score"', 'score_breakdown', 'reliability', 'affinity', 'pair_fit']) if (body.includes(word)) leaks.push(`${path}: ${word}`);
    }
    check('no volunteer-facing response carries the score, its breakdown or the reliability signal', leaks.length === 0, leaks);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
