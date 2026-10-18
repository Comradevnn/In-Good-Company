// Soft ranking through the real HTTP flow: a run that sees the whole pool
// pairs by fit, a search near its deadline is served first, a user's own
// private fit ratings steer their shift choice, and the score and its
// breakdown stay admin-only. Own server on :3050, own throwaway database.
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
