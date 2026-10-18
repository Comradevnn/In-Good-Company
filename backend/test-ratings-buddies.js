// Ratings visibility and the buddy system:
//   - org operational rating is public on the org profile; personal fit
//     never appears anywhere but the volunteer's own matching;
//   - the org's rating of a volunteer is visible to them, and public on
//     their partner card only if they choose;
//   - "would volunteer again" answers are never revealed; buddies form only
//     on a mutual yes, within each person's buddy cap;
//   - ending a buddyship is quiet; "no" means not paired again; buddy
//     repeat shifts count against the monthly cap; a poor private fit
//     rating only re-orders that user's own shifts.
// Own server on :3050, own throwaway database.
const crypto = require('node:crypto');
const h = require('./test-helpers');

h.useTempDb('ratings');
const { check, api } = h;

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const org = await h.makeOrg({ name: 'Ratings Org', mission_tags: ['Animal welfare'] });
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const bookingOf = (pid, userId) => db.prepare(`
    SELECT b.* FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id) WHERE p.id = ? AND b.user_id = ?
  `).get(pid, userId);
  // A completed shift together: paired, confirmed, both checked in, shift over.
  const completedPair = async (a, b, useOrg = org) => {
    isolate();
    const shift = await h.makeShift(useOrg, { daysAhead: 2 });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    await h.confirmPairing(a, pid);
    await h.confirmPairing(b, pid);
    await h.advance({ to: shift.starts_at });
    await h.advance({ minutes: 1 });
    for (const v of [a, b]) await api(`/orgs/mine/bookings/${bookingOf(pid, v.id).id}/check-in`, { method: 'POST', token: useOrg.token });
    await h.advance({ to: shift.ends_at });
    await h.advance({ minutes: 1 });
    return { pid, shift, ba: bookingOf(pid, a.id), bb: bookingOf(pid, b.id) };
  };
  const rate = (v, booking, body) => api(`/bookings/${booking.id}/ratings`, { method: 'POST', token: v.token, body });

  try {
    // ── Org ratings: public operational, private personal fit ──
    const ann = await h.makeVolunteer({ name: 'Ann', deeds: 5 });
    const ben = await h.makeVolunteer({ name: 'Ben', deeds: 5 });
    const one = await completedPair(ann, ben);
    const PRIVATE_FIT = 1; // a value we can look for
    await rate(ann, one.ba, { org_operational: 5, personal_fit: PRIVATE_FIT, partner_showed_up: true, volunteer_again: true });
    await rate(ben, one.bb, { org_operational: 2, personal_fit: 3, partner_showed_up: true, volunteer_again: false });
    const profile = await api(`/orgs/${org.id}`, { token: ann.token });
    check('operational ratings are public on the org profile', profile.body.operational_ratings['5'] === 1 && profile.body.operational_ratings['2'] === 1, profile.body.operational_ratings);
    check('personal fit never appears on the org profile', !JSON.stringify(profile.body).includes('personal_fit') && !JSON.stringify(profile.body).includes('fit'));
    const orgMetrics = await api('/orgs/mine/metrics', { token: org.token });
    check("personal fit isn't in the org's own metrics either", !JSON.stringify(orgMetrics.body).includes('fit'));
    const roster = await api(`/orgs/mine/shifts/${one.shift.id}/roster`, { token: org.token });
    check("…or the org's roster", !JSON.stringify(roster.body).includes('fit'));

    // ── Partner ratings and buddy answers are never revealed ──
    const annSees = JSON.stringify((await api(`/pairings/${one.pid}`, { token: ann.token })).body);
    check("Ann can't see whether Ben would volunteer with her again", !annSees.includes('volunteer_again') && !annSees.includes('showed_up'));
    const annNotes = (await api('/notifications', { token: ann.token })).body.notifications;
    check('a yes/no outcome sends nobody a buddy notification', !annNotes.some((n) => n.kind === 'buddy_formed'));
    check('…and forms no buddyship', (await api('/buddies', { token: ann.token })).body.buddies.length === 0);
    const resp = await rate(ann, one.ba, { volunteer_again: true });
    check('ratings can only be submitted once', resp.status === 409);

    // ── The org's rating of a volunteer: theirs to see, public only by choice ──
    await api(`/orgs/mine/bookings/${one.ba.id}/rate`, { method: 'POST', token: org.token, body: { attendance: 5, contribution: 5 } });
    const form = await api(`/bookings/${one.ba.id}/rating-form`, { token: ann.token });
    check('Ann sees the org\'s rating of her', form.body.org_rating_of_you?.attendance === 'good');
    const cal = await h.makeVolunteer({ name: 'Cal', deeds: 5 });
    isolate();
    await h.makeShift(org, { daysAhead: 3 });
    await h.startLooking(ann);
    await h.startLooking(cal);
    const annCalPid = await h.proposalFor(cal);
    const cardBefore = (await api(`/pairings/${annCalPid}`, { token: cal.token })).body.partner;
    check("by default the org's rating isn't on Ann's partner card", cardBefore.history.public_org_ratings.length === 0, cardBefore.history);
    check('the partner card shows a shift count and causes, but never org names', cardBefore.history.shift_count === 1 && !JSON.stringify(cardBefore).includes('Ratings Org'));
    await api(`/bookings/${one.ba.id}/org-rating-visibility`, { method: 'POST', token: ann.token, body: { public: true } });
    const cardAfter = (await api(`/pairings/${annCalPid}`, { token: cal.token })).body.partner;
    check('once Ann makes it public, it shows on her card (cause-level, no org name)',
      cardAfter.history.public_org_ratings.length === 1 && !JSON.stringify(cardAfter).includes('Ratings Org'), cardAfter.history);
    await api(`/pairings/${annCalPid}/decline`, { method: 'POST', token: cal.token, body: { keep_looking: false } });
    await api('/requests/current/cancel', { method: 'POST', token: ann.token });

    // ── "Would not volunteer again" → not paired again ──
    isolate();
    await h.makeShift(org, { daysAhead: 4 });
    await h.startLooking(ann);
    await h.startLooking(ben);
    const annBen = db.prepare(`
      SELECT COUNT(*) AS n FROM pairings WHERE status = 'proposed' AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
    `).get(ann.id, ben.id, ben.id, ann.id).n;
    check('after one said "no", the two aren\'t paired again', annBen === 0);
    await api('/requests/current/cancel', { method: 'POST', token: ann.token });
    await api('/requests/current/cancel', { method: 'POST', token: ben.token });

    // ── Mutual yes → buddies ──
    const dee = await h.makeVolunteer({ name: 'Dee', deeds: 5 });
    const eli = await h.makeVolunteer({ name: 'Eli', deeds: 5 });
    const two = await completedPair(dee, eli);
    const first = await rate(dee, two.ba, { org_operational: 4, personal_fit: 4, partner_showed_up: true, volunteer_again: true });
    check("the first 'yes' learns nothing about the other's answer", first.body.became_buddies === false);
    const secondRating = await rate(eli, two.bb, { org_operational: 4, personal_fit: 4, partner_showed_up: true, volunteer_again: true });
    check('mutual yes → buddies', secondRating.body.became_buddies === true);
    check('both are told they are buddies', (await api('/notifications', { token: dee.token })).body.notifications.some((n) => n.kind === 'buddy_formed'));

    // ── Buddy cap (free tier) ──
    const fred = await h.makeVolunteer({ name: 'Fred', deeds: 5 });
    db.prepare("UPDATE accounts SET created_at = datetime('now', '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)").run(dee.id);
    const three = await completedPair(dee, fred);
    await rate(dee, three.ba, { org_operational: 4, personal_fit: 4, partner_showed_up: true, volunteer_again: true });
    const capped = await rate(fred, three.bb, { org_operational: 4, personal_fit: 4, partner_showed_up: true, volunteer_again: true });
    check('a free user already at their buddy cap gains no new buddy (silently)', capped.body.became_buddies === false
      && (await api('/buddies', { token: dee.token })).body.buddies.length === 1);
    check('…and the other side is told nothing about why', !(await api('/notifications', { token: fred.token })).body.notifications.some((n) => n.kind.startsWith('buddy')));

    // ── Buddy repeat shifts count against the monthly cap ──
    const { monthKey } = require('./lib/time');
    const month = monthKey(new Date(await h.serverNow()));
    const used = db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND cap_month = ?').get(dee.id, month).n;
    const someShift = db.prepare('SELECT id FROM shifts LIMIT 1').get().id;
    for (let i = used; i < 2; i++) {
      db.prepare("INSERT INTO bookings (id, user_id, shift_id, kind, status, cap_month, created_at) VALUES (?, ?, ?, 'paired', 'attended', ?, ?)")
        .run(crypto.randomBytes(8).toString('hex'), dee.id, someShift, month, new Date().toISOString());
    }
    await api('/deeds/purchase', { method: 'POST', token: dee.token, body: { deeds: 5 } });
    isolate();
    await h.makeShift(org, { daysAhead: 3 });
    const buddyAsk = await h.startLooking(dee, { extra: { buddy_user_id: eli.id } });
    check('a buddy rebook is refused once the (free) monthly cap is used, same as any match',
      buddyAsk.status === 409 && buddyAsk.body.code === 'monthly_cap_reached', buddyAsk.body);

    // ── Ending a buddyship is quiet ──
    const deeBuddies = (await api('/buddies', { token: dee.token })).body.buddies;
    const eliNotesBefore = (await api('/notifications', { token: eli.token })).body.notifications.length;
    await api(`/buddies/${deeBuddies[0].buddy_id}/end`, { method: 'POST', token: dee.token });
    check('either buddy can end it', (await api('/buddies', { token: eli.token })).body.buddies.length === 0);
    check('…and the other person gets no notification', (await api('/notifications', { token: eli.token })).body.notifications.length === eliNotesBefore);

    // ── A low private fit rating only re-orders that user's own shifts ──
    const orgB = await h.makeOrg({ name: 'Second Org', mission_tags: ['Animal welfare'] });
    const gus = await h.makeVolunteer({ name: 'Gus', deeds: 5 });
    const hal = await h.makeVolunteer({ name: 'Hal', deeds: 5 });
    db.prepare(`INSERT INTO volunteer_org_ratings (booking_id, user_id, org_id, shift_id, operational, personal_fit, created_at)
      VALUES (?, ?, ?, ?, 4, 1, ?)`).run(`fixture-${Date.now()}`, gus.id, org.id, someShift, new Date().toISOString());
    isolate();
    await h.makeShift(org, { daysAhead: 2, title: 'Earlier, low fit' });
    const later = await h.makeShift(orgB, { daysAhead: 5, title: 'Later, unrated' });
    await h.startLooking(gus);
    await h.startLooking(hal);
    const ghPid = await h.proposalFor(gus);
    check("a user's low private fit for an org pushes its shifts behind others for them",
      db.prepare('SELECT shift_id FROM pairings WHERE id = ?').get(ghPid).shift_id === later.id);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
