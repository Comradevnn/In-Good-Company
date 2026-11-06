// Org-side shift cancellation: Deeds released in full (no forfeiture, no
// reliability event, nothing counted toward the monthly cap), pairings
// ended with no bail decision offered, proposals sent back to searching with
// the shift set aside, solo spots released, neutral notifications, and the
// route's guards. Own server on :3050, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('org-cancel');
const { check, api } = h;
const rules = require('./lib/rules');

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  try {
    // A volunteer whose trial is long over and who holds only purchased Deeds.
    const freeTierVol = async (opts = {}) => {
      const v = await h.makeVolunteer({ ...opts, deeds: undefined });
      db.prepare("UPDATE accounts SET created_at = datetime(?, '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)")
        .run(new Date(await h.serverNow()).toISOString().replace('T', ' ').slice(0, 19), v.id);
      if (opts.deeds) await api('/deeds/purchase', { method: 'POST', token: v.token, body: { deeds: opts.deeds } });
      return v;
    };
    const isolate = () => {
      db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
      db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
    };
    const balances = async (v) => {
      const b = (await api('/deeds', { token: v.token })).body;
      return { available: b.available, purchased: b.available_purchased, free: b.available_free, held: b.held };
    };
    const reliabilityCount = (userIds) => db.prepare(
      `SELECT COUNT(*) AS n FROM reliability_events WHERE user_id IN (${userIds.map(() => '?').join(',')})`).get(...userIds).n;
    const notificationsFor = async (v) => (await api('/notifications', { token: v.token })).body.notifications;
    const cancelAs = (org, shift, body) => api(`/orgs/mine/shifts/${shift.id}/cancel`, { method: 'POST', token: org.token, body });
    const shiftRow = (id) => db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
    const request = (vol) => db.prepare('SELECT * FROM availability_requests WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(vol.id);

    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const otherOrg = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const pairOn = async (a, b, daysAhead, { confirmBoth = true } = {}) => {
      isolate();
      const shift = await h.makeShift(org, { daysAhead });
      await h.startLooking(a);
      await h.startLooking(b);
      const pid = await h.proposalFor(a);
      if (!pid) throw new Error('expected a proposal');
      if (confirmBoth) {
        await h.confirmPairing(a, pid);
        await h.confirmPairing(b, pid);
      }
      return { pid, shift };
    };

    // ── Confirmed pair: one free-tier, one Premium ──
    const free1 = await freeTierVol({ name: 'FreeOne', deeds: 25 });
    const prem1 = await h.makeVolunteer({ name: 'PremOne', deeds: 25 });
    await api('/deeds', { token: prem1.token }); // lets the weekly grant land before we snapshot
    const beforeFree = await balances(free1);
    const beforePrem = await balances(prem1);
    const { pid, shift: s1 } = await pairOn(free1, prem1, 3);
    check('setup: the pair is confirmed with Deeds held',
      db.prepare('SELECT status FROM pairings WHERE id = ?').get(pid).status === 'confirmed' && (await balances(free1)).held > 0 && (await balances(prem1)).held > 0);
    check('setup: the free user\'s confirmed shift counts toward the cap', (await api('/premium', { token: free1.token })).body.cap.used === 1);
    check('setup: the Premium user held at least some free (granted) Deeds', (await balances(prem1)).free < beforePrem.free);
    const eventsBefore = reliabilityCount([free1.id, prem1.id]);

    const stranger = await cancelAs(otherOrg, s1, {});
    check('another org cannot cancel this shift (404)', stranger.status === 404);
    check('a volunteer cannot use the org route', (await api(`/orgs/mine/shifts/${s1.id}/cancel`, { method: 'POST', token: free1.token, body: {} })).status === 403);
    check('a too-long reason is refused', (await cancelAs(org, s1, { reason: 'x'.repeat(201) })).status === 400);
    check('a refused cancel changes nothing', shiftRow(s1.id).status === 'open');

    const done = await cancelAs(org, s1, { reason: 'Venue closed for repairs' });
    check('the org can cancel its own shift', done.status === 200 && done.body.shift_id === s1.id && done.body.status === 'cancelled' && done.body.volunteers_notified === 2, done.body);
    const row = shiftRow(s1.id);
    check('shift is cancelled with a timestamp and the reason kept', row.status === 'cancelled' && row.cancelled_at && row.cancel_reason === 'Venue closed for repairs');
    check('capacity counter drops back to zero', row.capacity_booked === 0);
    check('both balances are back to exactly their pre-confirm amounts',
      JSON.stringify(await balances(free1)) === JSON.stringify(beforeFree) && JSON.stringify(await balances(prem1)) === JSON.stringify(beforePrem),
      { free: await balances(free1), prem: await balances(prem1) });
    check('Deeds returned to the same buckets they came from (ledger consistent)',
      require('./lib/deeds').auditUser(free1.id).ok && require('./lib/deeds').auditUser(prem1.id).ok);
    check('no forfeiture revenue was written', db.prepare('SELECT COUNT(*) AS n FROM forfeiture_revenue').get().n === 0);
    check('no reliability events for either volunteer', reliabilityCount([free1.id, prem1.id]) === eventsBefore);
    const bookingRows = db.prepare('SELECT * FROM bookings WHERE shift_id = ?').all(s1.id);
    check('both bookings are cancelled as org_cancelled and off the cap',
      bookingRows.length === 2 && bookingRows.every((b) => b.status === 'cancelled' && b.cancel_type === 'org_cancelled' && b.cap_month === null && b.cancelled_at), bookingRows);
    check('every hold was released, none forfeited',
      db.prepare("SELECT COUNT(*) AS n FROM deeds_holds WHERE status = 'released'").get().n === 2
      && db.prepare("SELECT COUNT(*) AS n FROM deeds_holds WHERE status IN ('held', 'forfeited')").get().n === 0);
    const pairingRow = db.prepare('SELECT * FROM pairings WHERE id = ?').get(pid);
    check('the pairing ended with nobody marked as having backed out',
      pairingRow.status === 'cancelled' && pairingRow.ended_at && pairingRow.backed_out_by === null && pairingRow.bail_user_id === null);
    for (const v of [free1, prem1]) {
      const home = await h.home(v);
      check(`${v.name}: home offers no bail decision and no pairing action`, !home.actions.some((a) => ['bail_decision', 'proposal', 'awaiting_partner'].includes(a.type)));
      check(`${v.name}: the cancelled shift is not on their upcoming list`, !JSON.stringify(home.bookings ?? home.upcoming ?? []).includes(s1.id));
    }
    const note = (await notificationsFor(free1)).find((n) => n.kind === 'shift_cancelled');
    check('the notification is neutral: names the org, no other person, offers a new search',
      note && note.title === 'Your shift was cancelled' && note.body.includes(org.name) && !note.body.includes('PremOne')
      && !/couldn't make|backed out|your match/i.test(note.body) && note.ref_type === 'matching', note);
    check('the cancel reason is never shown to volunteers', !JSON.stringify(await notificationsFor(prem1)).includes('repairs'));

    const again = await cancelAs(org, s1, {});
    check('cancelling twice is refused (409 already_cancelled)', again.status === 409 && again.body.code === 'already_cancelled', again.body);
    const listed = (await api('/orgs/mine/shifts', { token: org.token })).body.shifts.find((s) => s.id === s1.id);
    check('the org listing shows the cancelled status', listed.status === 'cancelled');
    const roster = (await api(`/orgs/mine/shifts/${s1.id}/roster`, { token: org.token })).body;
    check('the roster shows the cancelled status and nobody on it', roster.shift.status === 'cancelled' && roster.roster.length === 0);
    check('the shift is no longer offered to volunteers', !(await api('/shifts', { token: free1.token })).body.shifts.some((s) => s.id === s1.id));
    check('a late search never matches onto the cancelled shift', (await h.tick(), db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status = 'proposed'").get(s1.id).n === 0));

    // The cancelled booking no longer counts: the free user can still book the full monthly cap.
    check('the cap is not consumed by the cancelled shift', (await api('/premium', { token: free1.token })).body.cap.used === 0);
    for (let i = 0; i < rules.FREE_MONTHLY_CAP; i++) {
      const partner = await h.makeVolunteer({ name: `Cap${i}`, deeds: 25 });
      await pairOn(free1, partner, 4 + i);
    }
    const capState = (await api('/premium', { token: free1.token })).body;
    check('the free user then confirms a full month\'s cap of shifts', capState.cap.used === rules.FREE_MONTHLY_CAP && capState.cap.cap === rules.FREE_MONTHLY_CAP, capState.cap);

    // ── Backed-out-on partner with an open decision ──
    const bA = await h.makeVolunteer({ name: 'BailA', deeds: 25 });
    const bB = await h.makeVolunteer({ name: 'BailB', deeds: 25 });
    const beforeB = await balances(bB);
    const { pid: bailPid, shift: s2 } = await pairOn(bA, bB, 6);
    const bookingA = db.prepare('SELECT id FROM bookings WHERE user_id = ? AND shift_id = ?').get(bA.id, s2.id);
    const out = await api(`/bookings/${bookingA.id}/cancel`, { method: 'POST', token: bA.token, body: {} });
    check('setup: one side backs out and the other is offered a decision',
      out.status === 200 && (await h.home(bB)).actions.some((a) => a.type === 'bail_decision'), out.body);
    const eventsBeforeBail = reliabilityCount([bB.id]);
    const bailDone = await cancelAs(org, s2, {});
    check('the org cancel still works with a decision open', bailDone.status === 200 && bailDone.body.volunteers_notified === 1, bailDone.body);
    check('no decision is offered any more', !(await h.home(bB)).actions.some((a) => a.type === 'bail_decision'));
    const lateChoice = await api(`/pairings/${bailPid}/bail-decision`, { method: 'POST', token: bB.token, body: { choice: 'rematch' } });
    check('answering the old decision is refused', lateChoice.status === 409 && lateChoice.body.code === 'no_decision', lateChoice.body);
    check('the pairing detail shows a closed decision', (await api(`/pairings/${bailPid}`, { token: bB.token })).body.bail?.open === false);
    check('the waiting partner got every Deed back and no reliability event',
      JSON.stringify(await balances(bB)) === JSON.stringify(beforeB) && reliabilityCount([bB.id]) === eventsBeforeBail);
    check('the old bail decision was closed with a neutral value',
      db.prepare('SELECT bail_choice FROM pairings WHERE id = ?').get(bailPid).bail_choice === 'org_cancelled');

    // ── Proposed pair: one side confirmed (Deeds held), the other not yet ──
    const pA = await h.makeVolunteer({ name: 'PropA', deeds: 25 });
    const pB = await h.makeVolunteer({ name: 'PropB', deeds: 25 });
    const beforePA = await balances(pA);
    isolate();
    const s3 = await h.makeShift(org, { daysAhead: 5 });
    await h.startLooking(pA);
    await h.startLooking(pB);
    const propPid = await h.proposalFor(pA);
    await h.confirmPairing(pA, propPid);
    check('setup: a proposal is open with one side holding Deeds', (await balances(pA)).held > 0 && (await h.proposalFor(pB)) === propPid);
    const propDone = await cancelAs(org, s3, {});
    check('cancelling a shift with an open proposal works', propDone.status === 200 && propDone.body.volunteers_notified === 2, propDone.body);
    check('the proposal ended and the held Deeds are back in full', db.prepare('SELECT status FROM pairings WHERE id = ?').get(propPid).status === 'cancelled'
      && JSON.stringify(await balances(pA)) === JSON.stringify(beforePA));
    for (const v of [pA, pB]) {
      const r = request(v);
      check(`${v.name}: search is back to searching with the shift set aside`,
        r.status === 'searching' && JSON.parse(r.excluded_shift_ids).includes(s3.id) && r.ended_at === null, r);
      const n = (await notificationsFor(v)).find((x) => x.kind === 'shift_cancelled');
      check(`${v.name}: told the proposal is off and that we are still looking`,
        n && n.body.includes(org.name) && n.body.includes("We're still looking") && !n.body.includes('PropB') && !n.body.includes('PropA'), n);
      check(`${v.name}: no proposal action is left`, !(await h.home(v)).actions.some((a) => ['proposal', 'awaiting_partner'].includes(a.type)));
    }
    check('they are not matched back onto the cancelled shift',
      db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status IN ('proposed', 'confirmed')").get(s3.id).n === 0);
    // A new shift can still pair them (the search really is alive).
    await h.makeShift(org, { daysAhead: 6, title: 'Replacement' });
    check('the resumed search can match them onto another shift', (await h.proposalFor(pA)) !== null);

    // A resumed search whose time ran out ends instead of reopening.
    const dA = await h.makeVolunteer({ name: 'DeadA', deeds: 25 });
    const dB = await h.makeVolunteer({ name: 'DeadB', deeds: 25 });
    isolate();
    const s4 = await h.makeShift(org, { daysAhead: 7 });
    await h.startLooking(dA);
    await h.startLooking(dB);
    check('setup: a proposal for the deadline case', (await h.proposalFor(dA)) !== null);
    db.prepare("UPDATE availability_requests SET search_deadline = ? WHERE user_id = ? AND status = 'proposed'")
      .run(new Date(await h.serverNow() - 1000).toISOString(), dA.id);
    await cancelAs(org, s4, {});
    check('a search past its deadline ends as no_match; the other carries on',
      request(dA).status === 'no_match' && request(dB).status === 'searching', [request(dA).status, request(dB).status]);
    const deadNote = (await notificationsFor(dA)).find((x) => x.kind === 'shift_cancelled');
    check('the one whose search ended is offered a new search instead', deadNote && deadNote.ref_type === 'matching' && deadNote.title === 'Your shift was cancelled');

    // ── Solo RSVP ──
    const solo = await h.makeVolunteer({ name: 'SoloOne', deeds: 5 });
    isolate();
    const s5 = await h.makeShift(org, { daysAhead: 8, capacity: 3 });
    const rsvp = await api(`/shifts/${s5.id}/rsvp-solo`, { method: 'POST', token: solo.token });
    check('setup: solo RSVP books a spot and starts an anchored search', rsvp.status < 300 && shiftRow(s5.id).capacity_booked === 1
      && db.prepare("SELECT COUNT(*) AS n FROM availability_requests WHERE user_id = ? AND kind = 'solo_rsvp' AND status = 'searching'").get(solo.id).n === 1, rsvp.body);
    const soloBefore = await balances(solo);
    const soloDone = await cancelAs(org, s5, {});
    check('cancelling releases the solo spot and tells the volunteer', soloDone.status === 200 && soloDone.body.volunteers_notified === 1, soloDone.body);
    check('the solo booking is cancelled, the capacity counter is consistent',
      db.prepare('SELECT status, cancel_type FROM bookings WHERE user_id = ? AND shift_id = ?').get(solo.id, s5.id).status === 'cancelled' && shiftRow(s5.id).capacity_booked === 0);
    check('the solo search was cancelled with it', request(solo).status === 'cancelled' && request(solo).ended_at);
    check('a solo volunteer\'s balance is untouched', JSON.stringify(await balances(solo)) === JSON.stringify(soloBefore));
    const soloNote = (await notificationsFor(solo)).find((x) => x.kind === 'shift_cancelled');
    check('the solo volunteer is offered a new search', soloNote && soloNote.ref_type === 'matching');
    check('the solo volunteer can search again right away', (await h.startLooking(solo)).status < 300);

    // ── Started shift ──
    isolate();
    const s6 = await h.makeShift(org, { daysAhead: 9 });
    db.prepare('UPDATE shifts SET starts_at = ? WHERE id = ?').run(new Date(await h.serverNow() - 3600000).toISOString(), s6.id);
    const started = await cancelAs(org, s6, {});
    check('a shift that has started cannot be cancelled (409 shift_started)', started.status === 409 && started.body.code === 'shift_started', started.body);
    check('...and stays open', shiftRow(s6.id).status === 'open');
    check('an unknown shift is a 404', (await cancelAs(org, { id: 'nope' }, {})).status === 404);
    check('a body-less cancel request passes validation (reaches the started-shift guard)', (await cancelAs(org, s6, undefined)).status === 409);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
