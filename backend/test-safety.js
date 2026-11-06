// Safety follow-through after a report: chat closes for the pair (confirmed
// and completed pairings), contact sharing can't be switched on, no
// conversation starters, "take me out" works even after the shift started,
// a report blocks a buddyship from forming, and strangers can't be flagged
// by id, and open reports from several different past partners pause the
// reported person's matching. Own server on :3050, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('safety');
const { check, api } = h;

const safeJson = (v) => { try { return JSON.parse(v ?? '[]'); } catch { return []; } };

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
    const reportedUser = async (name, deeds = 5) => {
      const user = await h.makeVolunteer({ name, deeds });
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
    check('reviewing one of two open reports keeps the safety hold',
      reasonsOf(S.user).join() === 'no_shows,safety_reports' && openReports().length === rules.SAFETY_PAUSE_DISTINCT_REPORTERS - 1, stateOf(S.user));
    await api(`/admin/safety-reports/${openReports()[0].id}/review`, { method: 'POST', admin: true, body: { note: 'checked' } });
    check('reviewing the last open report lifts the safety hold but not the no-show review',
      stateOf(S.user).account_review === 1 && reasonsOf(S.user).join() === 'no_shows', stateOf(S.user));
    const T = await reportedUser('Tess');
    for (const p of T.partners) await T.report(p);
    const tReports = db.prepare("SELECT id FROM safety_reports WHERE reported_user_id = ?").all(T.user.id);
    for (const r of tReports) await api(`/admin/safety-reports/${r.id}/review`, { method: 'POST', admin: true });
    check('a safety hold with no other reason ends once no reports remain open', stateOf(T.user).account_review === 0 && stateOf(T.user).review_reason === null, stateOf(T.user));
    const U = await reportedUser('Uma');
    for (const p of U.partners) await U.report(p);
    await api(`/admin/users/${U.user.id}/suspend`, { method: 'POST', admin: true });
    const uReports = db.prepare("SELECT id FROM safety_reports WHERE reported_user_id = ?").all(U.user.id);
    for (const r of uReports) await api(`/admin/safety-reports/${r.id}/review`, { method: 'POST', admin: true });
    check('a manual staff pause is not lifted by reviewing reports', stateOf(U.user).account_review === 1 && reasonsOf(U.user).join() === 'staff', stateOf(U.user));
    await api(`/admin/users/${U.user.id}/clear-review`, { method: 'POST', admin: true, body: { reason: 'staff' } });
    check('the staff pause is lifted by clearing the staff reason', stateOf(U.user).account_review === 0 && stateOf(U.user).review_reason === null, stateOf(U.user));

    // ── The automatic safety hold withdraws proposals the person hasn't confirmed ──
    const proposeBetween = async (x, y, opts = {}) => {
      if (!opts.keep) isolate();
      const shift = await h.makeShift(org, { daysAhead: opts.daysAhead ?? 3 });
      await h.startLooking(x);
      await h.startLooking(y);
      return { shift, pid: await h.proposalFor(x) };
    };
    const pairingOf = (pid) => db.prepare('SELECT * FROM pairings WHERE id = ?').get(pid);
    const requestOf = (u) => db.prepare('SELECT * FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(u.id);
    const eventsOf = (u) => db.prepare('SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ?').get(u.id).n;
    const notesOf = (u, kind) => db.prepare('SELECT title, body FROM notifications WHERE user_id = ? AND kind = ?').all(u.id, kind);
    const reportEnough = async (R, count = rules.SAFETY_PAUSE_DISTINCT_REPORTERS) => {
      for (const p of R.partners.slice(0, count)) await R.report(p);
    };
    const balanceOf = async (v) => (await api('/deeds', { token: v.token })).body;

    // Neither side confirmed: the held person's proposal is withdrawn.
    const X1 = await reportedUser('Xan');
    const Y1 = await h.makeVolunteer({ name: 'Yuri', deeds: 5 });
    const w1 = await proposeBetween(X1.user, Y1);
    check('setup: both are proposed the shift', w1.pid && requestOf(X1.user).status === 'proposed' && requestOf(Y1).status === 'proposed');
    const xNotesBefore = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(X1.user.id).n;
    await reportEnough(X1, rules.SAFETY_PAUSE_DISTINCT_REPORTERS - 1);
    check('a single report pauses nothing and withdraws nothing', pairingOf(w1.pid).status === 'proposed' && stateOf(X1.user).account_review === 0);
    await reportEnough(X1);
    check('the safety hold starts', reasonsOf(X1.user).join() === 'safety_reports', stateOf(X1.user));
    check('the unconfirmed proposal is withdrawn', pairingOf(w1.pid).status === 'withdrawn', pairingOf(w1.pid));
    check('the held person\'s own search ends', requestOf(X1.user).status === 'cancelled', requestOf(X1.user));
    check('the held person\'s fresh booking is cancelled and the spot freed',
      bookingOf(w1.pid, X1.user.id).status === 'cancelled' && db.prepare('SELECT capacity_booked FROM shifts WHERE id = ?').get(w1.shift.id).capacity_booked === 0);
    const xNotes = db.prepare('SELECT kind FROM notifications WHERE user_id = ? ORDER BY id').all(X1.user.id).slice(xNotesBefore).map((n) => n.kind);
    check('the held person gets only the neutral review notice', xNotes.join() === 'account_review', xNotes);
    check('the would-be partner is back to searching', requestOf(Y1).status === 'searching', requestOf(Y1));
    check('…with no shift excluded and no reliability event', safeJson(requestOf(Y1).excluded_shift_ids).length === 0 && eventsOf(Y1) === 0, requestOf(Y1));
    check('…and their cancelled booking is marked as a withdrawal, not a cancel, with nothing held', bookingOf(w1.pid, Y1.id).cancel_type === 'withdrawn' && (await balanceOf(Y1)).held === 0);
    const yNote = notesOf(Y1, 'proposal_fell_through').at(-1);
    check('…and told neutrally, with no hint of a report or review',
      yNote && !/report|review|safety|pause|Xan/i.test(`${yNote.title} ${yNote.body}`), yNote);

    // The partner had confirmed: their held Deeds come back in full.
    const X2 = await reportedUser('Xia');
    const Y2 = await h.makeVolunteer({ name: 'Yael', deeds: 5 });
    const w2 = await proposeBetween(X2.user, Y2);
    await h.confirmPairing(Y2, w2.pid);
    const y2Before = await balanceOf(Y2);
    check('setup: the partner\'s Deeds are on hold', y2Before.held > 0, y2Before);
    await reportEnough(X2);
    const y2After = await balanceOf(Y2);
    check('a partner who had confirmed gets their Deeds back in full', pairingOf(w2.pid).status === 'withdrawn' && y2After.held === 0 && y2After.available === y2Before.available + y2Before.held, { y2Before, y2After });
    check('…and goes back to searching without penalty', requestOf(Y2).status === 'searching' && eventsOf(Y2) === 0 && safeJson(requestOf(Y2).excluded_shift_ids).length === 0);
    check('…told neutrally that the Deeds are back', /back in your balance/.test(notesOf(Y2, 'proposal_fell_through').at(-1)?.body ?? '') && !/report|review|safety/i.test(notesOf(Y2, 'proposal_fell_through').at(-1)?.body ?? ''));

    // A proposal the held person already confirmed stays as it is.
    const X3 = await reportedUser('Xev');
    const Y3 = await h.makeVolunteer({ name: 'Yosef', deeds: 5 });
    const w3 = await proposeBetween(X3.user, Y3);
    await h.confirmPairing(X3.user, w3.pid);
    await reportEnough(X3);
    check('a proposal the held person already confirmed stays open',
      pairingOf(w3.pid).status === 'proposed' && bookingOf(w3.pid, X3.user.id).status === 'confirmed' && (await balanceOf(X3.user)).held > 0);
    check('…and its partner is untouched', requestOf(Y3).status === 'proposed' && notesOf(Y3, 'proposal_fell_through').length === 0);

    // A confirmed booking on another shift is left alone; only the open proposal goes.
    const X4 = await reportedUser('Xim', 25);
    const W4 = await h.makeVolunteer({ name: 'Wren', deeds: 5 });
    const Y4 = await h.makeVolunteer({ name: 'Yara', deeds: 5 });
    const first = await pairOn(X4.user, W4);
    const second = await proposeBetween(X4.user, Y4, { keep: true, daysAhead: 7 });
    check('setup: a second proposal on a different shift', second.pid && second.pid !== first.pid && pairingOf(second.pid).shift_id === second.shift.id, second);
    await reportEnough(X4);
    check('the unconfirmed proposal is withdrawn', pairingOf(second.pid).status === 'withdrawn');
    check('the confirmed pairing and its booking are untouched', pairingOf(first.pid).status === 'confirmed' && bookingOf(first.pid, X4.user.id).status === 'confirmed' && bookingOf(first.pid, W4.id).status === 'confirmed');
    check('…and so are the held Deeds for it', (await balanceOf(X4.user)).held > 0 && (await balanceOf(W4)).held > 0);

    // A held person with a solo spot keeps the spot; only the proposal built on it goes.
    const X7 = await reportedUser('Xyl');
    const Y7 = await h.makeVolunteer({ name: 'Yoon', deeds: 5 });
    isolate();
    const soloShift = await h.makeShift(org, { daysAhead: 3 });
    const rsvp = await api(`/shifts/${soloShift.id}/rsvp-solo`, { method: 'POST', token: X7.user.token });
    await h.startLooking(Y7);
    const w7 = { pid: await h.proposalFor(Y7) };
    check('setup: a solo spot is proposed a partner', rsvp.status === 201 && w7.pid && pairingOf(w7.pid).status === 'proposed', rsvp.body);
    await reportEnough(X7);
    check('the proposal built on a solo spot is withdrawn', pairingOf(w7.pid).status === 'withdrawn');
    check('…the held person keeps their solo booking', db.prepare("SELECT status, kind FROM bookings WHERE user_id = ? AND shift_id = ?").get(X7.user.id, soloShift.id).status === 'confirmed');
    check('…and the partner is searching again, unpenalised', requestOf(Y7).status === 'searching' && eventsOf(Y7) === 0);

    // The reporter who tips the count over, from inside the proposal, is simply out of it.
    const X8 = await reportedUser('Xad');
    const Y8 = await h.makeVolunteer({ name: 'Yoli', deeds: 5 });
    const w8 = await proposeBetween(X8.user, Y8);
    await reportEnough(X8, rules.SAFETY_PAUSE_DISTINCT_REPORTERS - 1);
    const tip = await api('/safety/reports', { method: 'POST', token: Y8.token, body: { category: 'other', pairing_id: w8.pid, cancel_pairing: true } });
    check('a report from inside the proposal that starts the hold succeeds with no cancel error', tip.status === 201 && tip.body.cancelled === true && !tip.body.cancel_error, tip.body);
    check('…and the proposal is withdrawn', pairingOf(w8.pid).status === 'withdrawn' && reasonsOf(X8.user).join() === 'safety_reports');

    // Staff and no-show reviews never withdraw anything.
    const X5 = await h.makeVolunteer({ name: 'Xue', deeds: 5 });
    const Y5 = await h.makeVolunteer({ name: 'Yves', deeds: 5 });
    const w5 = await proposeBetween(X5, Y5);
    await api(`/admin/users/${X5.id}/suspend`, { method: 'POST', admin: true });
    check('a staff pause withdraws nothing', reasonsOf(X5).join() === 'staff' && pairingOf(w5.pid).status === 'proposed' && requestOf(Y5).status === 'proposed');
    const X6 = await h.makeVolunteer({ name: 'Xoe', deeds: 5 });
    const Y6 = await h.makeVolunteer({ name: 'Yin', deeds: 5 });
    const w6 = await proposeBetween(X6, Y6);
    missShifts(X6);
    check('a no-show review withdraws nothing', reasonsOf(X6).join() === 'no_shows' && pairingOf(w6.pid).status === 'proposed' && requestOf(Y6).status === 'proposed');
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
