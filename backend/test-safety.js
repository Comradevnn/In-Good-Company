// Safety follow-through after a report: chat closes for the pair (confirmed
// and completed pairings), contact sharing can't be switched on, no
// conversation starters, "take me out" works even after the shift started,
// a report blocks a buddyship from forming, and strangers can't be flagged
// by id, and open reports from several different past partners pause the
// reported person's matching. Own server on :3050, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('safety');
const { check, api } = h;

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const bookingOf = (pid, userId) => db.prepare(`
    SELECT b.* FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id) WHERE p.id = ? AND b.user_id = ?
  `).get(pid, userId);
  const pairOn = async (a, b) => {
    isolate();
    const shift = await h.makeShift(org, { daysAhead: 3 });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    await h.confirmPairing(a, pid);
    await h.confirmPairing(b, pid);
    return { pid, shift };
  };
  const say = (v, pid, body) => api(`/pairings/${pid}/messages`, { method: 'POST', token: v.token, body: { body } });

  try {
    // ── Confirmed pairing: report without leaving → chat closes for both ──
    const a = await h.makeVolunteer({ name: 'Ada', deeds: 5 });
    const b = await h.makeVolunteer({ name: 'Bo', deeds: 5 });
    const one = await pairOn(a, b);
    await api(`/pairings/${one.pid}/contact-share`, { method: 'POST', token: b.token, body: { opt_in: true } });
    check('chat works before a report', (await say(b, one.pid, 'hi!')).status === 201);
    const rep = await api('/safety/reports', { method: 'POST', token: a.token, body: { category: 'inappropriate_messages', pairing_id: one.pid } });
    check('report is stored', rep.status === 201 && rep.body.report_id);
    const blocked = await say(b, one.pid, 'why did you go quiet');
    check('the reported person can no longer message (403 chat_blocked)', blocked.status === 403 && blocked.body.code === 'chat_blocked', blocked.body);
    check('…nor can the reporter', (await say(a, one.pid, 'test')).status === 403);
    const history = await api(`/pairings/${one.pid}/messages`, { token: b.token });
    check('message history stays readable', history.status === 200 && history.body.messages.some((m) => m.body === 'hi!'));
    const detailB = await api(`/pairings/${one.pid}`, { token: b.token });
    check('pairing detail says the chat is closed', detailB.body.chat_open === false && detailB.body.chat_closed_reason === 'report');
    check('existing contact-sharing opt-ins were cleared', detailB.body.contact_share.me === false && detailB.body.contact_share.partner === false);
    const share = await api(`/pairings/${one.pid}/contact-share`, { method: 'POST', token: b.token, body: { opt_in: true } });
    check('contact sharing cannot be switched back on', share.status === 403);
    await h.advance({ to: one.shift.starts_at });
    await h.advance({ minutes: 30 });
    const starters = (await api(`/pairings/${one.pid}/messages`, { token: a.token })).body.messages.filter((m) => m.kind === 'starter');
    check('no conversation starters are posted into a blocked pairing', starters.length === 0, starters);

    // ── Report after the shift started, with "take me out" ──
    const c = await h.makeVolunteer({ name: 'Cy', deeds: 5 });
    const d = await h.makeVolunteer({ name: 'Di', deeds: 5 });
    const two = await pairOn(c, d);
    await h.advance({ to: two.shift.starts_at });
    await h.advance({ minutes: 10 });
    const midShift = await api('/safety/reports', { method: 'POST', token: c.token, body: { category: 'safety_concern', pairing_id: two.pid, cancel_pairing: true } });
    check('a mid-shift report with "take me out" succeeds', midShift.status === 201 && midShift.body.cancelled === true && !midShift.body.cancel_error, midShift.body);
    const cDeeds = (await api('/deeds', { token: c.token })).body;
    check('…the reporter\'s Deeds are released', cDeeds.held === 0);
    check('…with no late-cancel mark', db.prepare("SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ? AND kind = 'late_cancel'").get(c.id).n === 0);
    check('…and the reported partner is not charged either', (await api('/deeds', { token: d.token })).body.held === 0);
    check('only one report was filed', db.prepare('SELECT COUNT(*) AS n FROM safety_reports WHERE reporter_user_id = ?').get(c.id).n === 1);

    // ── Completed pairing: report closes the chat too; no buddyship forms ──
    const e = await h.makeVolunteer({ name: 'Ed', deeds: 5 });
    const f = await h.makeVolunteer({ name: 'Flo', deeds: 5 });
    const three = await pairOn(e, f);
    await h.advance({ to: three.shift.starts_at });
    await h.advance({ minutes: 1 });
    for (const v of [e, f]) await api(`/orgs/mine/bookings/${bookingOf(three.pid, v.id).id}/check-in`, { method: 'POST', token: org.token });
    await h.advance({ to: three.shift.ends_at });
    await h.advance({ minutes: 1 });
    await api(`/bookings/${bookingOf(three.pid, e.id).id}/ratings`, { method: 'POST', token: e.token, body: { org_operational: 5, personal_fit: 5, partner_showed_up: true, volunteer_again: true } });
    await api('/safety/reports', { method: 'POST', token: e.token, body: { category: 'other', pairing_id: three.pid } });
    const fRate = await api(`/bookings/${bookingOf(three.pid, f.id).id}/ratings`, { method: 'POST', token: f.token, body: { org_operational: 5, personal_fit: 5, partner_showed_up: true, volunteer_again: true } });
    check('yes → report → yes forms no buddyship', fRate.body.became_buddies === false && (await api('/buddies', { token: f.token })).body.buddies.length === 0);
    check('a completed pairing\'s chat closes after a report', (await say(f, three.pid, 'hey')).status === 403);

    // ── No flagging strangers by id ──
    const stranger = await h.makeVolunteer({ name: 'Stranger' });
    const byId = await api('/safety/reports', { method: 'POST', token: stranger.token, body: { category: 'other', reported_user_id: a.id } });
    check('a report about someone you were never paired with is rejected', byId.status === 404, byId.body);
    const known = await api('/safety/reports', { method: 'POST', token: b.token, body: { category: 'other', reported_user_id: a.id } });
    check('…but a report about a past partner by id is accepted', known.status === 201);

    // ── Repeated reports from different past partners pause matching ──
    const R = await h.makeVolunteer({ name: 'Rex', deeds: 5 });
    const P1 = await h.makeVolunteer({ name: 'Pam' });
    const P2 = await h.makeVolunteer({ name: 'Pip' });
    for (const p of [P1, P2]) {
      db.prepare("INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status) VALUES (?, ?, ?, 'past-shift', 'completed')")
        .run(`past-${p.id}`, R.id, p.id);
    }
    const reportAbout = (v) => api('/safety/reports', { method: 'POST', token: v.token, body: { category: 'other', reported_user_id: R.id } });
    const reviewOf = () => db.prepare('SELECT account_review, review_reason FROM users WHERE id = ?').get(R.id);
    await reportAbout(P1);
    await reportAbout(P1);
    check('one past partner reporting (even twice) does not pause matching', reviewOf().account_review === 0, reviewOf());
    await reportAbout(P2);
    check('open reports from two different past partners pause matching', reviewOf().account_review === 1 && reviewOf().review_reason === 'safety_reports', reviewOf());
    const refusedSearch = await h.startLooking(R);
    check('…so the paused person cannot start a search', refusedSearch.status === 409 && refusedSearch.body.code === 'account_review', refusedSearch.body);
    const notice = db.prepare("SELECT title, body FROM notifications WHERE user_id = ? AND kind = 'account_review' ORDER BY id DESC LIMIT 1").get(R.id);
    check('…and is told neutrally, with nothing about who reported them', notice && !/Pam|Pip|report/i.test(`${notice.title} ${notice.body}`), notice);
    const own = JSON.stringify((await api('/users/me', { token: R.token })).body);
    check('the review reason is never sent to the user', !own.includes('review_reason') && !own.includes('safety_reports'));
    await api(`/admin/users/${R.id}/clear-review`, { method: 'POST', admin: true });
    check('staff clearing the review lifts the pause', reviewOf().account_review === 0 && reviewOf().review_reason === null);

    // ── Review reasons are independent ──
    const reliabilityLib = require('./lib/reliability');
    const rules = require('./lib/rules');
    const reportedUser = async (name) => {
      const user = await h.makeVolunteer({ name, deeds: 5 });
      const partners = [];
      for (let i = 0; i < rules.SAFETY_PAUSE_DISTINCT_REPORTERS; i++) {
        const partner = await h.makeVolunteer({ name: `${name}-partner-${i}` });
        db.prepare("INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status) VALUES (?, ?, ?, 'past-shift', 'completed')")
          .run(`past-${name}-${i}`, user.id, partner.id);
        partners.push(partner);
      }
      const report = (partner) => api('/safety/reports', { method: 'POST', token: partner.token, body: { category: 'other', reported_user_id: user.id } });
      return { user, partners, report };
    };
    const stateOf = (u) => db.prepare('SELECT account_review, review_reason, matching_paused_until FROM users WHERE id = ?').get(u.id);
    const reasonsOf = (u) => String(stateOf(u).review_reason ?? '').split(',').filter(Boolean).sort();
    const missShifts = (u) => { for (let i = 0; i < rules.NO_SHOW_REVIEW_AT; i++) reliabilityLib.record(u.id, 'no_show'); };

    // A no-show review first, then safety reports: both reasons are kept.
    const N = await reportedUser('Nia');
    missShifts(N.user);
    check('repeat no-shows put the account under review', stateOf(N.user).account_review === 1 && reasonsOf(N.user).join() === 'no_shows', stateOf(N.user));
    for (const p of N.partners) await N.report(p);
    check('safety reports add their reason even when the account is already under review',
      stateOf(N.user).account_review === 1 && reasonsOf(N.user).join() === 'no_shows,safety_reports', stateOf(N.user));
    const unknownReason = await api(`/admin/users/${N.user.id}/clear-review`, { method: 'POST', admin: true, body: { reason: 'because' } });
    check('clearing an unknown review reason is refused and changes nothing', unknownReason.status === 400 && reasonsOf(N.user).length === 2, unknownReason.body);
    await api(`/admin/users/${N.user.id}/clear-review`, { method: 'POST', admin: true, body: { reason: 'safety_reports' } });
    check('clearing the safety reason leaves the no-show review in place',
      stateOf(N.user).account_review === 1 && reasonsOf(N.user).join() === 'no_shows', stateOf(N.user));
    check('…so the person still cannot start a search', (await h.startLooking(N.user)).body.code === 'account_review');
    const noShowNotice = db.prepare("SELECT title FROM notifications WHERE user_id = ? AND kind = 'account_review'").all(N.user.id);
    check('the no-show review is announced with the same notification kind as any other review',
      noShowNotice.length >= 1 && db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'reliability_review'").get(N.user.id).n === 0, noShowNotice);
    await api(`/admin/users/${N.user.id}/clear-review`, { method: 'POST', admin: true, body: { reason: 'no_shows' } });
    check('clearing the last reason lifts the review', stateOf(N.user).account_review === 0 && stateOf(N.user).review_reason === null);

    // Safety reports first, then a no-show review: clearing no-shows keeps the safety hold.
    const M = await reportedUser('Moe');
    for (const p of M.partners) await M.report(p);
    missShifts(M.user);
    check('a no-show review is added alongside an existing safety hold', reasonsOf(M.user).join() === 'no_shows,safety_reports', stateOf(M.user));
    db.prepare("UPDATE users SET matching_paused_until = ? WHERE id = ?").run(new Date(Date.now() + 86400000).toISOString(), M.user.id);
    await api(`/admin/users/${M.user.id}/clear-review`, { method: 'POST', admin: true, body: { reason: 'no_shows' } });
    check('clearing the no-show reason leaves the safety hold and ends the temporary pause',
      stateOf(M.user).account_review === 1 && reasonsOf(M.user).join() === 'safety_reports' && stateOf(M.user).matching_paused_until === null, stateOf(M.user));
    await api(`/admin/users/${M.user.id}/clear-review`, { method: 'POST', admin: true });
    check('clearing without a reason lifts every reason', stateOf(M.user).account_review === 0 && stateOf(M.user).review_reason === null);

    // Staff review of the reports lifts only the automatic safety hold.
    const S = await reportedUser('Sol');
    missShifts(S.user);
    for (const p of S.partners) await S.report(p);
    const openReports = () => db.prepare("SELECT id FROM safety_reports WHERE reported_user_id = ? AND status = 'open'").all(S.user.id);
    check('two open reports plus a no-show review hold the account for both reasons', reasonsOf(S.user).join() === 'no_shows,safety_reports' && openReports().length === rules.SAFETY_PAUSE_DISTINCT_REPORTERS);
    await api(`/admin/safety-reports/${openReports()[0].id}/review`, { method: 'POST', admin: true, body: { note: 'checked' } });
    check('reviewing a report so that too few remain open lifts the safety hold but not the no-show review',
      stateOf(S.user).account_review === 1 && reasonsOf(S.user).join() === 'no_shows', stateOf(S.user));
    const T = await reportedUser('Tess');
    for (const p of T.partners) await T.report(p);
    const tReports = db.prepare("SELECT id FROM safety_reports WHERE reported_user_id = ?").all(T.user.id);
    await api(`/admin/safety-reports/${tReports[0].id}/review`, { method: 'POST', admin: true });
    check('a safety hold with no other reason ends when the reports drop below the threshold', stateOf(T.user).account_review === 0 && stateOf(T.user).review_reason === null, stateOf(T.user));
    await api(`/admin/users/${T.user.id}/suspend`, { method: 'POST', admin: true });
    await api(`/admin/safety-reports/${tReports[1].id}/review`, { method: 'POST', admin: true });
    check('a manual staff pause is not lifted by reviewing reports', stateOf(T.user).account_review === 1 && reasonsOf(T.user).join() === 'staff', stateOf(T.user));
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
