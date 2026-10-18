// Pairing state machine: decline, proposal expiry, back-out (grace / late),
// keeping a spot solo, and the backed-out-on partner's choice — release,
// rematch (success and failure), no response within the decision window,
// and a back-out too close to the shift for a decision window at all. Plus
// one open search per user and solo RSVP → paired later.
// Own server on :3050, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('pairing');
const { check, api } = h;

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const balances = async (v) => (await api('/deeds', { token: v.token })).body;
  const bookingOf = (pid, userId) => db.prepare(`
    SELECT b.* FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id) WHERE p.id = ? AND b.user_id = ?
  `).get(pid, userId);
  const capacity = (shiftId) => db.prepare('SELECT capacity_booked FROM shifts WHERE id = ?').get(shiftId).capacity_booked;
  const pairOn = async (a, b, opts = {}) => {
    isolate();
    const shift = await h.makeShift(org, { daysAhead: opts.daysAhead ?? 3, capacity: opts.capacity ?? 6 });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    if (opts.confirm !== false) {
      await h.confirmPairing(a, pid);
      await h.confirmPairing(b, pid);
    }
    return { pid, shift };
  };
  const requestOf = async (v) => (await api('/requests/current', { token: v.token })).body.request;

  try {
    // ── One open search ("slot") per user ──
    const solo = await h.makeVolunteer({ deeds: 5 });
    isolate();
    await h.startLooking(solo);
    const second = await h.startLooking(solo);
    check('a second search while one is open is refused', second.status === 409 && second.body.code === 'request_open');
    await api('/requests/current/cancel', { method: 'POST', token: solo.token });

    // ── Decline (keep looking) ──
    const d1 = await h.makeVolunteer({ deeds: 5 });
    const d2 = await h.makeVolunteer({ deeds: 5 });
    const declined = await pairOn(d1, d2, { confirm: false });
    await h.confirmPairing(d2, declined.pid);
    const d2Held = (await balances(d2)).held;
    await api(`/pairings/${declined.pid}/decline`, { method: 'POST', token: d1.token, body: { keep_looking: true } });
    check('decline ends the proposal', db.prepare('SELECT status FROM pairings WHERE id = ?').get(declined.pid).status === 'declined');
    check('the decliner keeps looking, minus that shift', (await requestOf(d1)).status === 'searching'
      && JSON.parse(db.prepare("SELECT excluded_shift_ids FROM availability_requests WHERE user_id = ? AND status = 'searching'").get(d1.id).excluded_shift_ids).includes(declined.shift.id));
    check('the other person goes back to searching and their hold is released', (await requestOf(d2)).status === 'searching' && d2Held === 5 && (await balances(d2)).held === 0);
    check('the declined proposal\'s spots are released', capacity(declined.shift.id) === 0);
    const d2Notes = (await api('/notifications', { token: d2.token })).body.notifications.map((n) => n.kind);
    check('the other person is told honestly that it fell through', d2Notes.includes('proposal_fell_through'), d2Notes);

    // ── Proposal expiry ──
    const e1 = await h.makeVolunteer({ deeds: 5 });
    const e2 = await h.makeVolunteer({ deeds: 5 });
    const expiring = await pairOn(e1, e2, { confirm: false });
    await h.confirmPairing(e1, expiring.pid);
    await h.advance({ hours: 25 });
    check('an unanswered proposal expires', db.prepare('SELECT status FROM pairings WHERE id = ?').get(expiring.pid).status === 'expired');
    check('the person who confirmed gets their hold back and keeps searching', (await balances(e1)).held === 0 && (await requestOf(e1))?.status === 'searching');
    check('the person who never answered has their search paused (and is told)', !(await requestOf(e2)) || (await requestOf(e2)).status !== 'searching');
    check('…with a notification', (await api('/notifications', { token: e2.token })).body.notifications.some((n) => n.kind === 'proposal_expired'));

    // ── Late back-out → partner chooses "release" ──
    const a1 = await h.makeVolunteer({ deeds: 5 });
    const b1 = await h.makeVolunteer({ deeds: 5 });
    const p1 = await pairOn(a1, b1);
    await h.advance({ hours: 2 });
    await api(`/bookings/${bookingOf(p1.pid, a1.id).id}/cancel`, { method: 'POST', token: a1.token, body: {} });
    const b1Home = await h.home(b1);
    const decision = b1Home.actions.find((a) => a.type === 'bail_decision');
    check('the backed-out-on partner gets an active choice with a deadline', Boolean(decision) && Date.parse(decision.deadline) - (await h.serverNow()) <= 8 * 3600000 + 1000, decision);
    const detail = await api(`/pairings/${p1.pid}`, { token: b1.token });
    check('…and still holds their spot and Deeds while deciding', detail.body.bail.open && detail.body.my_booking.hold.status === 'held');
    check('chat tells them their match can\'t make it', (await api(`/pairings/${p1.pid}/messages`, { token: b1.token })).body.messages.some((m) => m.kind === 'system'));
    const bystander = (await api(`/pairings/${p1.pid}/messages`, { token: a1.token })).body.messages.some((m) => m.kind === 'system');
    check('…a note only the partner sees', !bystander);
    await api(`/pairings/${p1.pid}/bail-decision`, { method: 'POST', token: b1.token, body: { choice: 'release' } });
    check('"release" returns their Deeds in full', (await balances(b1)).held === 0 && (await balances(b1)).available >= 5);
    check('…frees their spot', capacity(p1.shift.id) === 0);
    check('…and doesn\'t count toward their cap', (await api('/premium', { token: b1.token })).body.cap.used === 0);
    check('…and is not a reliability mark against them', db.prepare('SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ?').get(b1.id).n === 0);
    const again = await api(`/pairings/${p1.pid}/bail-decision`, { method: 'POST', token: b1.token, body: { choice: 'rematch' } });
    check('the decision can only be made once', again.status === 409);

    // ── Back-out → partner chooses "rematch" → new partner found ──
    const a2 = await h.makeVolunteer({ deeds: 5 });
    const b2 = await h.makeVolunteer({ deeds: 5 });
    const p2 = await pairOn(a2, b2);
    const b2HoldBefore = bookingOf(p2.pid, b2.id).hold_id;
    await api(`/bookings/${bookingOf(p2.pid, a2.id).id}/cancel`, { method: 'POST', token: a2.token, body: {} });
    const rem = await api(`/pairings/${p2.pid}/bail-decision`, { method: 'POST', token: b2.token, body: { choice: 'rematch' } });
    check('"find me someone new" starts a rematch search for the same shift', rem.body.request?.kind === 'rematch' && rem.body.request.status === 'searching', rem.body);
    const c2 = await h.makeVolunteer({ deeds: 5 });
    await h.startLooking(c2);
    const newPid = await h.proposalFor(c2);
    const newPairing = db.prepare('SELECT * FROM pairings WHERE id = ?').get(newPid);
    check('a new partner is proposed onto the same shift', newPairing.shift_id === p2.shift.id && newPairing.origin === 'rematch');
    const b2View = await api(`/pairings/${newPid}`, { token: b2.token });
    check('the rematched person is already confirmed (their hold stands)', b2View.body.me_confirmed === true, b2View.body);
    await h.confirmPairing(c2, newPid);
    check('once the new partner confirms, the pairing is on', db.prepare('SELECT status FROM pairings WHERE id = ?').get(newPid).status === 'confirmed');
    check('the same hold carries over (no second hold, no double cap count)',
      bookingOf(newPid, b2.id).hold_id === b2HoldBefore && (await api('/premium', { token: b2.token })).body.cap.used === 1);
    check('capacity: original spot reused, one new spot for the new partner', capacity(p2.shift.id) === 2);

    // ── Rematch that finds nobody → released, spot kept solo ──
    const a3 = await h.makeVolunteer({ deeds: 5 });
    const b3 = await h.makeVolunteer({ deeds: 5 });
    const p3 = await pairOn(a3, b3);
    await api(`/bookings/${bookingOf(p3.pid, a3.id).id}/cancel`, { method: 'POST', token: a3.token, body: {} });
    await api(`/pairings/${p3.pid}/bail-decision`, { method: 'POST', token: b3.token, body: { choice: 'rematch' } });
    await h.advance({ to: new Date(Date.parse(p3.shift.starts_at) - 90 * 60000).toISOString() });
    const b3Booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingOf(p3.pid, b3.id).id);
    check('no rematch in time → Deeds released in full', (await balances(b3)).held === 0);
    check('…and the spot is kept as solo (they can still go)', b3Booking.status === 'confirmed' && b3Booking.kind === 'solo');
    check('…and they are told', (await api('/notifications', { token: b3.token })).body.notifications.some((n) => n.kind === 'rematch_failed'));

    // ── No answer within the decision window → safe default ──
    const a4 = await h.makeVolunteer({ deeds: 5 });
    const b4 = await h.makeVolunteer({ deeds: 5 });
    const p4 = await pairOn(a4, b4);
    await api(`/bookings/${bookingOf(p4.pid, a4.id).id}/cancel`, { method: 'POST', token: a4.token, body: {} });
    await h.advance({ hours: 8, minutes: 5 });
    check('no answer in time → Deeds released and the booking cancelled',
      (await balances(b4)).held === 0 && db.prepare('SELECT status FROM bookings WHERE id = ?').get(bookingOf(p4.pid, b4.id).id).status === 'cancelled');
    check('…recorded as such', db.prepare('SELECT bail_choice FROM pairings WHERE id = ?').get(p4.pid).bail_choice === 'no_response_release');

    // ── Back-out too close to the shift for a decision window ──
    const a5 = await h.makeVolunteer({ deeds: 5 });
    const b5 = await h.makeVolunteer({ deeds: 5 });
    const p5 = await pairOn(a5, b5);
    await h.advance({ to: new Date(Date.parse(p5.shift.starts_at) - 2 * 3600000).toISOString() });
    const prev5 = await api(`/bookings/${bookingOf(p5.pid, a5.id).id}/cancel-preview`, { token: a5.token });
    // (a5 is on the signup trial, so this uses the Premium penalty-free cancel)
    check('inside the back-out cutoff the preview flags it', prev5.body.inside_backout_cutoff === true && prev5.body.type === 'free_late', prev5.body);
    await api(`/bookings/${bookingOf(p5.pid, a5.id).id}/cancel`, { method: 'POST', token: a5.token, body: {} });
    const b5Booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingOf(p5.pid, b5.id).id);
    check('too close to decide → partner\'s Deeds released immediately, spot kept solo',
      (await balances(b5)).held === 0 && b5Booking.kind === 'solo' && b5Booking.status === 'confirmed');
    check('…no decision is left hanging', !(await h.home(b5)).actions.some((a) => a.type === 'bail_decision'));

    // ── Grace-window back-out: free for the backer, partner still decides ──
    const a6 = await h.makeVolunteer({ deeds: 5 });
    const b6 = await h.makeVolunteer({ deeds: 5 });
    const p6 = await pairOn(a6, b6);
    await api(`/bookings/${bookingOf(p6.pid, a6.id).id}/cancel`, { method: 'POST', token: a6.token, body: { keep_spot_solo: true } });
    const a6Booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingOf(p6.pid, a6.id).id);
    check('backing out but keeping the spot solo: booking stays, no longer paired', a6Booking.status === 'confirmed' && a6Booking.kind === 'solo' && !a6Booking.pairing_id);
    check('…grace window → Deeds released', (await balances(a6)).held === 0);
    check('…and the partner still gets their choice', (await h.home(b6)).actions.some((a) => a.type === 'bail_decision'));
    check('…capacity unchanged (the solo spot is still used)', capacity(p6.shift.id) === 2);

    // ── Solo RSVP, then paired onto that shift later ──
    isolate();
    const soloShift = await h.makeShift(org, { daysAhead: 4, capacity: 4 });
    const s1 = await h.makeVolunteer({ deeds: 5 });
    const rsvp = await api(`/shifts/${soloShift.id}/rsvp-solo`, { method: 'POST', token: s1.token });
    check('solo RSVP books a spot with no Deeds held', rsvp.status === 201 && rsvp.body.kind === 'solo' && (await balances(s1)).held === 0);
    const s2 = await h.makeVolunteer({ deeds: 5 });
    await h.startLooking(s2);
    const soloPid = await h.proposalFor(s1);
    check('"we\'ll still try to pair you": a partner is proposed onto that shift', Boolean(soloPid) && db.prepare('SELECT shift_id FROM pairings WHERE id = ?').get(soloPid).shift_id === soloShift.id);
    await h.confirmPairing(s1, soloPid);
    await h.confirmPairing(s2, soloPid);
    check('both confirm → paired; the solo spot becomes a paired booking with a hold',
      db.prepare('SELECT status FROM pairings WHERE id = ?').get(soloPid).status === 'confirmed' && (await balances(s1)).held === 5);
    check('capacity counts each person once', capacity(soloShift.id) === 2);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
