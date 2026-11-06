// Org-side shift cancellation. The org calls a shift off; nobody on it is at
// fault, so every volunteer's Deeds come back in full, no reliability event
// is written, nothing counts toward the monthly cap, pairings on the shift
// end, and each volunteer is told neutrally and offered a new search.
//
// One transaction. lifecycle.endProposal is deliberately not used: its
// messages say a partner couldn't make it, which isn't what happened here.
const db = require('../db');
const clock = require('./clock');
const deeds = require('./deeds');
const lifecycle = require('./lifecycle');
const { notify } = require('./notify');
const { getShift, releaseSpots } = require('./shifts');
const { safeParseArray } = require('../matching/engine');

const CANCEL_TYPE = 'org_cancelled';

const cancelInTransaction = db.transaction((orgId, shiftId, reason) => {
  const shift = getShift(shiftId);
  if (!shift || shift.org_id !== orgId) throw new lifecycle.LifecycleError('not_found', 'Shift not found.', 404);
  if (shift.status === 'cancelled') throw new lifecycle.LifecycleError('already_cancelled', 'This shift is already cancelled.');
  if (Date.parse(shift.starts_at) <= clock.nowMs()) throw new lifecycle.LifecycleError('shift_started', 'This shift has already started.');

  const now = clock.isoNow();
  db.prepare("UPDATE shifts SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?").run(now, reason, shift.id);

  // Anchored searches (a solo spot or rematch spot on this shift) stop with it.
  const onShift = db.prepare('SELECT id FROM bookings WHERE shift_id = ?').all(shift.id).map((b) => b.id);
  db.prepare(`
    UPDATE availability_requests SET status = 'cancelled', ended_at = ?
    WHERE status IN ('searching', 'proposed') AND anchor_booking_id IN (SELECT value FROM json_each(?))
  `).run(now, JSON.stringify(onShift));

  // Pairings: proposed, confirmed, and ones whose backed-out-on partner
  // hasn't answered yet (no decision is offered any more).
  const pairings = db.prepare(`
    SELECT * FROM pairings WHERE shift_id = ? AND (status IN ('proposed', 'confirmed') OR (status = 'cancelled' AND bail_choice IS NULL))
  `).all(shift.id);
  const resumed = new Set(); // users whose standard search carries on
  for (const pairing of pairings) {
    const wasProposed = pairing.status === 'proposed';
    if (pairing.status === 'cancelled') {
      db.prepare("UPDATE pairings SET bail_choice = ? WHERE id = ?").run(CANCEL_TYPE, pairing.id);
    } else {
      db.prepare("UPDATE pairings SET status = 'cancelled', ended_at = ? WHERE id = ?").run(now, pairing.id);
    }
    if (!wasProposed) continue;
    // A proposal that fell through: each person's own search goes back to
    // searching with this shift set aside (or ends if its time ran out).
    for (const side of ['a', 'b']) {
      const request = db.prepare('SELECT * FROM availability_requests WHERE id = ?').get(pairing[`request_${side}_id`]);
      if (!request || request.status !== 'proposed') continue;
      const excluded = safeParseArray(request.excluded_shift_ids);
      excluded.push(shift.id);
      const next = clock.parseTime(request.search_deadline) <= clock.nowMs() ? 'no_match' : 'searching';
      db.prepare(`
        UPDATE availability_requests SET status = ?, excluded_shift_ids = ?, ended_at = CASE WHEN ? = 'searching' THEN NULL ELSE ? END WHERE id = ?
      `).run(next, JSON.stringify(excluded), next, now, request.id);
      if (next === 'searching') resumed.add(pairing[`user_${side}_id`]);
    }
  }

  // Bookings: Deeds released in full, no reliability event, off the cap.
  const bookings = db.prepare("SELECT * FROM bookings WHERE shift_id = ? AND status IN ('proposed', 'confirmed')").all(shift.id);
  const told = new Set();
  for (const booking of bookings) {
    const hadHold = Boolean(booking.hold_id);
    if (hadHold) deeds.resolveHold(booking.hold_id, 'released', CANCEL_TYPE, shift.org_id);
    db.prepare(`
      UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_type = ?, cap_month = NULL WHERE id = ?
    `).run(now, CANCEL_TYPE, booking.id);
    releaseSpots(shift.id, 1);

    if (told.has(booking.user_id)) continue;
    told.add(booking.user_id);
    const org = shift.org.name;
    if (resumed.has(booking.user_id)) {
      notify(booking.user_id, 'shift_cancelled', 'That shift was cancelled',
        `${org} had to cancel ${shift.when_label}, so that proposal is off.${hadHold ? ' Any Deeds you put on hold are back in your balance.' : ''} We're still looking for you.`);
    } else {
      notify(booking.user_id, 'shift_cancelled', 'Your shift was cancelled',
        `${org} had to cancel ${shift.when_label}. Any Deeds you had on hold are back in your balance. Want to find another shift?`,
        { type: 'matching' });
    }
  }
  return { shift_id: shift.id, status: 'cancelled', volunteers_notified: told.size };
});

function cancelShift(org, shiftId, reason = null) {
  const result = cancelInTransaction(org.id, shiftId, reason);
  // Anyone sent back to searching gets matched again right away (the cancelled
  // shift is closed, so it can't come back).
  lifecycle.tick();
  return result;
}

module.exports = { cancelShift, CANCEL_TYPE };
