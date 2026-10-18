// The pairing lifecycle: availability requests → proposal → each side
// confirms (only then are Deeds held) → confirmed pairing with chat → shift
// day (org check-in / no-show) → completion and ratings. Also every
// time-based transition (proposal expiry, the backed-out-on partner's
// decision window, rematch and waiting deadlines, conversation starters,
// attendance auto-resolution), which tick() applies.
//
// Every state change runs inside a transaction. Errors meant for the app
// are LifecycleError(code, message) and map to 4xx responses in the routes.
const crypto = require('node:crypto');
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const deeds = require('./deeds');
const premium = require('./premium');
const reliability = require('./reliability');
const chat = require('./chat');
const { notify } = require('./notify');
const { getShift, releaseSpots, reserveSpots, visibleShifts } = require('./shifts');
const { runMatching, eligibilityBlock, shiftsFor, activeBookings, overlaps, logMatch } = require('./matchingRunner');
const { localDate, monthKey, endOfLocalDayMs, addDays } = require('./time');
const { haversineMiles, computeAlignment, safeParseArray } = require('../matching/engine');

class LifecycleError extends Error {
  constructor(code, message, status = 409, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const id = () => crypto.randomBytes(16).toString('hex');
const nowIso = () => clock.isoNow();
const getUser = (userId) => db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
const getBooking = (bookingId) => db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
const getPairing = (pairingId) => db.prepare('SELECT * FROM pairings WHERE id = ?').get(pairingId);
const getRequest = (requestId) => db.prepare('SELECT * FROM availability_requests WHERE id = ?').get(requestId);

function sideOf(pairing, userId) {
  if (pairing.user_a_id === userId) return { me: 'a', other: 'b' };
  if (pairing.user_b_id === userId) return { me: 'b', other: 'a' };
  return null;
}

function requirePairingMember(pairingId, userId) {
  const pairing = getPairing(pairingId);
  const side = pairing && sideOf(pairing, userId);
  if (!side) throw new LifecycleError('not_found', 'Pairing not found.', 404);
  return { pairing, side };
}

// ── Availability requests (the "slot") ──

function openRequest(userId) {
  return db.prepare(`
    SELECT * FROM availability_requests WHERE user_id = ? AND status IN ('searching', 'proposed')
    ORDER BY created_at DESC LIMIT 1
  `).get(userId);
}

const BLOCK_MESSAGES = {
  verification_incomplete: 'Verify your ID before we can start matching you.',
  ineligible_data_incomplete: 'Finish your profile (at least two causes) before matching.',
  ineligible_age: 'In Good Company matches adults 18 and over.',
  matching_paused: 'Matching is paused on your account for now.',
  account_review: 'Your account is under review, so matching is paused.',
  monthly_cap_reached: "You've reached this month's matched-shift limit for your plan.",
};

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function activeBuddyIds(userId) {
  return db.prepare(`
    SELECT CASE WHEN user_low_id = ? THEN user_high_id ELSE user_low_id END AS other
    FROM buddies WHERE status = 'active' AND (user_low_id = ? OR user_high_id = ?)
  `).all(userId, userId, userId).map((r) => r.other);
}

const createRequest = db.transaction((user, body) => {
  if (openRequest(user.id)) {
    throw new LifecycleError('request_open', "You're already being matched — check your current search.");
  }
  const block = eligibilityBlock(user, { kind: 'standard' }, clock.nowMs());
  if (block) throw new LifecycleError(block, BLOCK_MESSAGES[block], 409, reliability.matchingBlock(user) ?? {});

  const price = deeds.shiftPriceDeeds();
  const balance = deeds.balances(user.id);
  if (balance.available < price) {
    throw new LifecycleError('insufficient_deeds', `You'll need ${price} Deeds available to confirm a shift. You have ${balance.available}.`, 409,
      { needed: price, available: balance.available });
  }

  const today = localDate(clock.now());
  const windowStart = body.window_start ?? user.availability_window_start;
  const windowEnd = body.window_end ?? user.availability_window_end;
  if (!validDate(windowStart) || !validDate(windowEnd)) {
    throw new LifecycleError('invalid_window', 'Pick the dates you are free (YYYY-MM-DD).', 400);
  }
  if (windowEnd < windowStart) throw new LifecycleError('invalid_window', 'End date must be on or after the start date.', 400);
  if (windowEnd < today) throw new LifecycleError('window_in_past', 'Those dates have passed — pick new ones.', 400);

  const radius = body.travel_radius_miles != null ? Number(body.travel_radius_miles) : (user.travel_radius_miles ?? 10);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
    throw new LifecycleError('invalid_radius', 'Travel distance must be between 1 and 100 miles.', 400);
  }

  let buddyId = null;
  if (body.buddy_user_id) {
    if (!activeBuddyIds(user.id).includes(body.buddy_user_id)) {
      throw new LifecycleError('not_a_buddy', 'That person is not one of your active buddies.', 400);
    }
    buddyId = body.buddy_user_id;
  }

  let ageMin = null;
  let ageMax = null;
  if (body.age_min != null || body.age_max != null) {
    if (premium.state(user).tier !== 'premium') {
      throw new LifecycleError('premium_required', 'Partner age filters are a Premium feature.', 403);
    }
    ageMin = body.age_min != null ? Number(body.age_min) : null;
    ageMax = body.age_max != null ? Number(body.age_max) : null;
  }

  // The search stops at the waiting cap, or once no shift in the window can
  // still meet the minimum lead time, whichever comes first.
  const nowMs = clock.nowMs();
  const deadlineMs = Math.min(nowMs + rules.WAIT_CAP_MS, endOfLocalDayMs(windowEnd) - rules.MIN_LEAD_MS);
  if (deadlineMs <= nowMs) {
    throw new LifecycleError('window_too_soon', "We need at least a day's notice to set up a shift — pick dates a little further out.", 400);
  }

  const requestId = id();
  db.prepare(`
    INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, buddy_user_id,
      age_min, age_max, status, search_deadline, created_at)
    VALUES (?, ?, 'standard', ?, ?, ?, ?, ?, ?, 'searching', ?, ?)
  `).run(requestId, user.id, windowStart, windowEnd, radius, buddyId, ageMin, ageMax, new Date(deadlineMs).toISOString(), nowIso());
  // Keep the profile's "latest availability" in step, so the availability
  // screen pre-fills with what the user last submitted.
  db.prepare(`
    UPDATE users SET availability_window_start = ?, availability_window_end = ?, travel_radius_miles = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(windowStart, windowEnd, radius, user.id);
  logMatch(`${user.display_name} started looking: ${windowStart} → ${windowEnd}, ${radius} mi${buddyId ? ' (with a buddy)' : ''}`);
  return requestId;
});

function submitRequest(user, body) {
  const requestId = createRequest(user, body);
  runMatching();
  return requestId;
}

function cancelRequest(user) {
  const request = openRequest(user.id);
  if (!request) throw new LifecycleError('no_request', 'You are not being matched right now.', 404);
  if (request.status === 'proposed') {
    throw new LifecycleError('proposal_pending', 'You have a shift proposal waiting — decline it to stop looking.');
  }
  db.prepare("UPDATE availability_requests SET status = 'cancelled', ended_at = ? WHERE id = ?").run(nowIso(), request.id);
}

// Adjusting a search (one of the waiting-period alternatives): widen the
// radius, add a cause, or move the dates. Re-opens a search that already
// ended without a match.
const adjustRequest = db.transaction((user, body) => {
  let request = openRequest(user.id);
  if (!request) {
    request = db.prepare(`
      SELECT * FROM availability_requests WHERE user_id = ? AND status = 'no_match' AND kind = 'standard'
      ORDER BY created_at DESC LIMIT 1
    `).get(user.id);
  }
  if (!request || request.status === 'proposed') throw new LifecycleError('no_request', 'There is no search to adjust.', 404);

  const updates = {};
  if (body.travel_radius_miles != null) {
    const radius = Number(body.travel_radius_miles);
    if (!Number.isFinite(radius) || radius <= 0 || radius > 100) throw new LifecycleError('invalid_radius', 'Travel distance must be between 1 and 100 miles.', 400);
    updates.travel_radius_miles = radius;
    db.prepare('UPDATE users SET travel_radius_miles = ? WHERE id = ?').run(radius, user.id);
  }
  if (body.window_start || body.window_end) {
    const start = body.window_start ?? request.window_start;
    const end = body.window_end ?? request.window_end;
    if (!validDate(start) || !validDate(end) || end < start) throw new LifecycleError('invalid_window', 'Pick a valid date range.', 400);
    updates.window_start = start;
    updates.window_end = end;
    db.prepare('UPDATE users SET availability_window_start = ?, availability_window_end = ? WHERE id = ?').run(start, end, user.id);
  }
  if (body.add_cause) {
    const causes = safeParseArray(user.cause_tags);
    if (!causes.includes(body.add_cause)) {
      causes.push(body.add_cause);
      db.prepare('UPDATE users SET cause_tags = ? WHERE id = ?').run(JSON.stringify(causes), user.id);
    }
  }
  if (body.drop_buddy) updates.buddy_user_id = null;

  const nowMs = clock.nowMs();
  const windowEnd = updates.window_end ?? request.window_end;
  const deadlineMs = Math.min(nowMs + rules.WAIT_CAP_MS, endOfLocalDayMs(windowEnd) - rules.MIN_LEAD_MS);
  if (deadlineMs <= nowMs) throw new LifecycleError('window_too_soon', 'Pick dates a little further out.', 400);
  updates.search_deadline = new Date(Math.max(deadlineMs, clock.parseTime(request.search_deadline))).toISOString();
  updates.status = 'searching';
  updates.last_reason = null;
  updates.ended_at = null;
  const set = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE availability_requests SET ${set} WHERE id = @id`).run({ ...updates, id: request.id });
});

// Solo RSVP (a waiting-period alternative): take one spot on a specific
// shift now, without a partner and without a Deeds hold; matching keeps
// trying to pair the user onto that same shift until shortly before it.
const rsvpSolo = db.transaction((user, shiftId) => {
  const shift = getShift(shiftId);
  if (!shift || !shift.org.verified || shift.status !== 'open') throw new LifecycleError('not_found', 'Shift not found.', 404);
  if (Date.parse(shift.starts_at) <= clock.nowMs()) throw new LifecycleError('shift_started', 'That shift has already started.');
  const block = eligibilityBlock(user, { kind: 'solo_rsvp' }, clock.nowMs());
  if (block === 'verification_incomplete' || block === 'ineligible_age' || block === 'account_review' || block === 'matching_paused') {
    throw new LifecycleError(block, BLOCK_MESSAGES[block]);
  }
  if (overlaps(shift, activeBookings(user.id))) throw new LifecycleError('overlap', 'You already have a shift at that time.');
  const existing = openRequest(user.id);
  if (existing?.status === 'proposed') throw new LifecycleError('proposal_pending', 'You have a shift proposal waiting — respond to it first.');
  if (!reserveSpots(shift.id, 1)) throw new LifecycleError('shift_full', 'That shift just filled up.');

  const bookingId = id();
  db.prepare(`
    INSERT INTO bookings (id, user_id, shift_id, kind, status, confirmed_at, created_at)
    VALUES (?, ?, ?, 'solo', 'confirmed', ?, ?)
  `).run(bookingId, user.id, shift.id, nowIso(), nowIso());
  if (existing) {
    db.prepare("UPDATE availability_requests SET status = 'cancelled', ended_at = ? WHERE id = ?").run(nowIso(), existing.id);
  }
  // Still try to find a partner for this exact shift (only while there is
  // room for a normal proposal response window, and only within the cap).
  const day = localDate(new Date(shift.starts_at), shift.timezone);
  const deadline = Date.parse(shift.starts_at) - rules.PROPOSAL_LAST_RESPONSE_BEFORE_SHIFT_MS;
  if (deadline > clock.nowMs() && block !== 'monthly_cap_reached') {
    db.prepare(`
      INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, anchor_booking_id,
        status, search_deadline, created_at)
      VALUES (?, ?, 'solo_rsvp', ?, ?, ?, ?, 'searching', ?, ?)
    `).run(id(), user.id, day, day, user.travel_radius_miles ?? 10, bookingId, new Date(deadline).toISOString(), nowIso());
  }
  return bookingId;
});

// ── Proposal → confirm / decline ──

function bookingsOf(pairing) {
  return { a: getBooking(pairing.booking_a_id), b: getBooking(pairing.booking_b_id) };
}

const confirm = db.transaction((user, pairingId, { safetyNoticeAck } = {}) => {
  const { pairing, side } = requirePairingMember(pairingId, user.id);
  if (pairing.status !== 'proposed') throw new LifecycleError('not_proposed', 'This shift proposal is no longer open.');
  if (clock.parseTime(pairing.proposal_expires_at) <= clock.nowMs()) {
    // tick() ends it (a throw here would roll back any cleanup anyway).
    throw new LifecycleError('expired', 'This proposal expired before it was confirmed.', 410);
  }
  const booking = getBooking(pairing[`booking_${side.me}_id`]);
  if (booking.status === 'confirmed' && booking.hold_id && booking.kind === 'paired') {
    return finalizeIfReady(getPairing(pairingId)); // already confirmed (rematch side, or a repeat tap)
  }

  // Pre-first-shift safety notice must be acknowledged before the first hold.
  if (!user.safety_notice_ack_at) {
    if (!safetyNoticeAck) {
      throw new LifecycleError('safety_notice_required', 'Please read the safety notice before confirming your first shift.');
    }
    db.prepare('UPDATE users SET safety_notice_ack_at = ? WHERE id = ?').run(nowIso(), user.id);
  }

  const cap = premium.capStatus(user);
  if (cap.used >= cap.cap) {
    throw new LifecycleError('monthly_cap_reached', BLOCK_MESSAGES.monthly_cap_reached, 409, cap);
  }
  const shift = getShift(pairing.shift_id);
  if (overlaps(shift, activeBookings(user.id).filter((b) => b.status === 'confirmed'), booking.id)) {
    throw new LifecycleError('overlap', 'You already have a confirmed shift at that time.');
  }

  let holdId;
  try {
    holdId = deeds.placeHold(user.id, booking.id, deeds.shiftPriceDeeds());
  } catch (err) {
    if (err instanceof deeds.DeedsError) throw new LifecycleError(err.code, err.message, 409, err.extra);
    throw err;
  }
  db.prepare(`
    UPDATE bookings SET status = 'confirmed', kind = 'paired', hold_id = ?, confirmed_at = ?, cap_month = ? WHERE id = ?
  `).run(holdId, nowIso(), monthKey(clock.now()), booking.id);

  const partnerId = pairing[`user_${side.other}_id`];
  const updated = getPairing(pairingId);
  const done = finalizeIfReady(updated);
  if (!done) {
    notify(partnerId, 'partner_confirmed', `${user.display_name} confirmed`,
      `${user.display_name} is in for ${shift.when_label}. Confirm to lock it in.`, { type: 'pairing', id: pairingId });
  }
  return done;
});

// Both sides confirmed → the pairing is on: bookings join it, requests
// close, the chat opens with each side's warm introduction.
function finalizeIfReady(pairing) {
  const { a, b } = bookingsOf(pairing);
  const ready = [a, b].every((bk) => bk.status === 'confirmed' && bk.kind === 'paired' && bk.hold_id);
  if (!ready || pairing.status !== 'proposed') return pairing.status === 'confirmed';

  const now = nowIso();
  db.prepare("UPDATE pairings SET status = 'confirmed', confirmed_at = ? WHERE id = ?").run(now, pairing.id);
  db.prepare('UPDATE bookings SET pairing_id = ? WHERE id IN (?, ?)').run(pairing.id, a.id, b.id);
  for (const requestId of [pairing.request_a_id, pairing.request_b_id]) {
    db.prepare("UPDATE availability_requests SET status = 'matched', matched_at = ?, ended_at = ? WHERE id = ?").run(now, now, requestId);
  }
  const shift = getShift(pairing.shift_id);
  const userA = getUser(pairing.user_a_id);
  const userB = getUser(pairing.user_b_id);
  chat.sendIntros(pairing, shift, userA, userB);
  for (const [me, other] of [[userA, userB], [userB, userA]]) {
    notify(me.id, 'pairing_confirmed', "You're paired!",
      `You and ${other.display_name} are set for ${shift.when_label} at ${shift.org.name}. Say hi in chat.`, { type: 'pairing', id: pairing.id });
  }
  logMatch(`pairing confirmed: ${userA.display_name} + ${userB.display_name} at ${shift.org.name} (${shift.when_label})`);
  return true;
}

// Ends a proposal that never became a confirmed pairing. Fresh bookings
// created for it are cancelled (spot released, any hold released — nobody
// pays for a pairing that never formed). Anchored bookings (a solo spot or
// a rematch spot the user already had) stay put.
function endProposal(pairing, status, actorUserId, { keepLooking = true, skipBookingId = null } = {}) {
  const now = nowIso();
  db.prepare('UPDATE pairings SET status = ?, ended_at = ? WHERE id = ?').run(status, now, pairing.id);
  const shift = getShift(pairing.shift_id);
  for (const s of ['a', 'b']) {
    const userId = pairing[`user_${s}_id`];
    const booking = getBooking(pairing[`booking_${s}_id`]);
    const request = getRequest(pairing[`request_${s}_id`]);
    const responded = booking.status === 'confirmed';
    if (booking.id !== skipBookingId) {
      if (booking.pairing_id === pairing.id) {
        if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'released', `proposal_${status}`, shift.org_id);
        db.prepare(`
          UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_type = ?, cap_month = NULL WHERE id = ?
        `).run(now, status, booking.id);
        releaseSpots(shift.id, 1);
      } else if (request?.kind === 'solo_rsvp' && booking.hold_id) {
        // A solo-RSVP user who confirmed into this proposal goes back to solo.
        deeds.resolveHold(booking.hold_id, 'released', `proposal_${status}`, shift.org_id);
        db.prepare("UPDATE bookings SET kind = 'solo', hold_id = NULL, cap_month = NULL WHERE id = ?").run(booking.id);
      }
    }

    if (!request) continue;
    let next = 'searching';
    if (userId === actorUserId) {
      next = keepLooking ? 'searching' : 'cancelled';
      if (keepLooking && !request.anchor_booking_id) {
        const excluded = safeParseArray(request.excluded_shift_ids);
        excluded.push(shift.id);
        db.prepare('UPDATE availability_requests SET excluded_shift_ids = ? WHERE id = ?').run(JSON.stringify(excluded), request.id);
      }
    } else if (status === 'expired' && !responded) {
      next = 'cancelled';
      notify(userId, 'proposal_expired', 'We paused your search',
        "Your shift proposal expired before you confirmed it, so we've stopped looking for now. Start a new search anytime.");
    } else {
      notify(userId, 'proposal_fell_through', "That one didn't work out",
        `Your proposed partner couldn't make ${shift.when_label}. We're still looking for you${responded ? ' — any Deeds you put on hold are back in your balance' : ''}.`);
    }
    if (next === 'searching' && clock.parseTime(request.search_deadline) <= clock.nowMs()) next = 'no_match';
    db.prepare(`
      UPDATE availability_requests SET status = ?, ended_at = CASE WHEN ? = 'searching' THEN NULL ELSE ? END WHERE id = ?
    `).run(next, next, now, request.id);
  }
}

const decline = db.transaction((user, pairingId, { keepLooking = true } = {}) => {
  const { pairing, side } = requirePairingMember(pairingId, user.id);
  if (pairing.status !== 'proposed') throw new LifecycleError('not_proposed', 'This shift proposal is no longer open.');
  const booking = getBooking(pairing[`booking_${side.me}_id`]);
  const request = getRequest(pairing[`request_${side.me}_id`]);
  if (booking.status === 'confirmed' && booking.pairing_id === pairing.id) {
    throw new LifecycleError('already_confirmed', 'You already confirmed — use cancel instead.');
  }
  if (booking.status === 'confirmed' && request?.kind === 'solo_rsvp' && booking.hold_id) {
    throw new LifecycleError('already_confirmed', 'You already confirmed — use cancel instead.');
  }
  endProposal(pairing, 'declined', user.id, { keepLooking });
});

function submitDecline(user, pairingId, options) {
  decline(user, pairingId, options);
  runMatching();
}

// ── Cancelling / backing out ──

function hoursUntil(iso) {
  return (Date.parse(iso) - clock.nowMs()) / clock.HOUR;
}

// What cancelling would cost, without doing it — shown to the user first.
function cancelPreview(user, bookingId) {
  const booking = getBooking(bookingId);
  if (!booking || booking.user_id !== user.id) throw new LifecycleError('not_found', 'Booking not found.', 404);
  if (booking.status !== 'confirmed') throw new LifecycleError('not_cancellable', 'This booking can no longer be cancelled.');
  const shift = getShift(booking.shift_id);
  if (Date.parse(shift.starts_at) <= clock.nowMs()) throw new LifecycleError('shift_started', 'This shift has already started.');
  const hours = hoursUntil(shift.starts_at);
  const price = booking.hold_id ? db.prepare('SELECT amount_purchased + amount_free AS n FROM deeds_holds WHERE id = ?').get(booking.hold_id).n : 0;
  const pairing = booking.pairing_id ? getPairing(booking.pairing_id) : null;
  const partnerName = pairing && ['confirmed', 'proposed'].includes(pairing.status)
    ? getUser(pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id)?.display_name : null;

  let type;
  let outcome;
  if (booking.kind === 'solo' || !booking.hold_id) {
    type = 'solo';
    outcome = 'none';
  } else if (clock.nowMs() - clock.parseTime(booking.confirmed_at) <= rules.GRACE_WINDOW_MS) {
    type = 'grace';
    outcome = 'released';
  } else if (premium.freeLateCancelAvailable(user)) {
    type = 'free_late';
    outcome = 'released';
  } else {
    type = 'late';
    outcome = 'forfeited';
  }
  const graceEndsAt = booking.confirmed_at && booking.hold_id
    ? new Date(clock.parseTime(booking.confirmed_at) + rules.GRACE_WINDOW_MS).toISOString() : null;
  const messages = {
    solo: 'No Deeds are involved in a solo spot — cancelling just frees it up for someone else.',
    grace: `You're inside the grace window, so your ${price} Deeds go straight back to your balance.`,
    free_late: `This uses your one penalty-free late cancellation this month (Premium), so your ${price} Deeds are released.`,
    late: `You're past the grace window, so your ${price} Deeds held for this shift go to ${shift.org.name} and won't come back.`,
  };
  return {
    booking_id: booking.id,
    type,
    deeds_outcome: outcome,
    amount: price,
    hours_before_shift: Math.round(hours * 10) / 10,
    inside_backout_cutoff: hours < rules.BACKOUT_CUTOFF_MS / clock.HOUR,
    grace_ends_at: graceEndsAt,
    message: messages[type],
    partner_name: partnerName,
    partner_message: partnerName
      ? `${partnerName} will be told you can't make it and asked whether they'd like a new partner or their Deeds back — they never pay for your cancellation.`
      : null,
    can_keep_spot_solo: booking.kind === 'paired' && Boolean(partnerName),
  };
}

const cancelBooking = db.transaction((user, bookingId, { keepSpotSolo = false, reason = null } = {}) => {
  const preview = cancelPreview(user, bookingId);
  const booking = getBooking(bookingId);
  const shift = getShift(booking.shift_id);
  const now = nowIso();
  // Safety cancellations (from a report) never cost Deeds or reliability.
  const type = reason === 'safety' ? 'safety' : preview.type;

  if (booking.hold_id) {
    const outcome = type === 'late' ? 'forfeited' : 'released';
    deeds.resolveHold(booking.hold_id, outcome, `cancel_${type}`, shift.org_id);
  }
  const reliabilityKind = {
    grace: 'grace_cancel', free_late: 'free_late_cancel', late: 'late_cancel',
    solo: preview.inside_backout_cutoff ? 'late_cancel' : 'grace_cancel',
    safety: null,
  }[type];
  if (reliabilityKind) reliability.record(user.id, reliabilityKind, booking.id);
  // Released-at-no-cost bookings don't count toward the monthly cap.
  const keepsCap = type === 'late';

  const pairing = booking.pairing_id ? getPairing(booking.pairing_id) : null;
  if (keepSpotSolo && preview.can_keep_spot_solo) {
    db.prepare(`UPDATE bookings SET kind = 'solo', pairing_id = NULL, cap_month = ${keepsCap ? 'cap_month' : 'NULL'} WHERE id = ?`)
      .run(booking.id);
  } else {
    db.prepare(`
      UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_type = ?, cap_month = ${keepsCap ? 'cap_month' : 'NULL'} WHERE id = ?
    `).run(now, type, booking.id);
    releaseSpots(shift.id, 1);
  }
  // A solo spot that was still being matched stops being matched.
  db.prepare(`
    UPDATE availability_requests SET status = 'cancelled', ended_at = ? WHERE anchor_booking_id = ? AND status IN ('searching', 'proposed')
  `).run(now, booking.id);

  if (pairing?.status === 'confirmed') partnerBackedOut(pairing, user);
  // Any still-open proposal this booking is part of (the partner hasn't
  // confirmed yet, or a solo/rematch spot was being matched) ends too.
  const open = db.prepare(`
    SELECT * FROM pairings WHERE status = 'proposed' AND (booking_a_id = ? OR booking_b_id = ?)
  `).get(booking.id, booking.id);
  if (open) endProposal(open, 'declined', user.id, { keepLooking: false, skipBookingId: booking.id });
  logMatch(`${user.display_name} cancelled a booking at ${shift.org.name} (${type}, Deeds ${preview.deeds_outcome})`);
  return { ...preview, type };
});

// The partner who got backed out on gets an active choice — new partner or
// Deeds back — with a decision window. If the shift is too close for that
// to be meaningful, their Deeds are released right away and they keep their
// spot to go solo (or cancel it, free).
function partnerBackedOut(pairing, backer) {
  const now = clock.nowMs();
  const shift = getShift(pairing.shift_id);
  const partnerSide = pairing.user_a_id === backer.id ? 'b' : 'a';
  const partnerId = pairing[`user_${partnerSide}_id`];
  const partnerBooking = getBooking(pairing[`booking_${partnerSide}_id`]);
  const deadlineMs = Math.min(now + rules.BAIL_DECISION_MS, Date.parse(shift.starts_at) - rules.BAIL_MIN_TIME_BEFORE_SHIFT_MS);

  db.prepare(`
    UPDATE pairings SET status = 'cancelled', ended_at = ?, backed_out_by = ?, bail_user_id = ?, bail_deadline = ? WHERE id = ?
  `).run(new Date(now).toISOString(), backer.id, partnerId, new Date(Math.max(deadlineMs, now)).toISOString(), pairing.id);
  chat.post(pairing.id, { kind: 'system', body: `${backer.display_name} can't make this shift anymore.`, visibleTo: partnerId });

  if (deadlineMs <= now) {
    keepSpotSoloAfterRelease(partnerBooking, shift, 'partner_backed_out_late');
    db.prepare("UPDATE pairings SET bail_choice = 'auto_release' WHERE id = ?").run(pairing.id);
    notify(partnerId, 'partner_backed_out', 'Your match can\'t make it',
      `${backer.display_name} had to cancel ${shift.when_label}. It's too close to the shift to find someone new, so your Deeds are back in your balance. Your spot is still yours if you'd like to go solo — or cancel it, free.`,
      { type: 'booking', id: partnerBooking.id });
  } else {
    notify(partnerId, 'bail_decision', 'Your match can\'t make it',
      `${backer.display_name} had to cancel ${shift.when_label}. Want us to find you someone new, or would you rather get your Deeds back?`,
      { type: 'pairing', id: pairing.id });
  }
}

function keepSpotSoloAfterRelease(booking, shift, reason) {
  if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'released', reason, shift.org_id);
  db.prepare("UPDATE bookings SET kind = 'solo', pairing_id = NULL, cap_month = NULL WHERE id = ?").run(booking.id);
}

function releaseAndCancel(booking, shift, cancelType, reason) {
  if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'released', reason, shift.org_id);
  db.prepare(`
    UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_type = ?, cap_month = NULL WHERE id = ?
  `).run(nowIso(), cancelType, booking.id);
  releaseSpots(shift.id, 1);
}

const bailDecision = db.transaction((user, pairingId, choice) => {
  const { pairing, side } = requirePairingMember(pairingId, user.id);
  if (pairing.status !== 'cancelled' || pairing.bail_user_id !== user.id || pairing.bail_choice) {
    throw new LifecycleError('no_decision', 'There is no decision waiting on this pairing.');
  }
  if (clock.parseTime(pairing.bail_deadline) <= clock.nowMs()) {
    throw new LifecycleError('decision_expired', 'The decision window has closed — your Deeds were released.', 410);
  }
  const booking = getBooking(pairing[`booking_${side.me}_id`]);
  const shift = getShift(pairing.shift_id);
  if (choice === 'release') {
    releaseAndCancel(booking, shift, 'partner_released', 'partner_backed_out');
    db.prepare("UPDATE pairings SET bail_choice = 'release' WHERE id = ?").run(pairing.id);
    return { choice };
  }
  if (choice !== 'rematch') throw new LifecycleError('invalid_choice', "choice must be 'rematch' or 'release'.", 400);
  const day = localDate(new Date(shift.starts_at), shift.timezone);
  const deadline = Date.parse(shift.starts_at) - rules.REMATCH_LAST_PROPOSAL_BEFORE_SHIFT_MS;
  db.prepare(`
    INSERT INTO availability_requests (id, user_id, kind, window_start, window_end, travel_radius_miles, anchor_booking_id,
      status, search_deadline, created_at)
    VALUES (?, ?, 'rematch', ?, ?, ?, ?, 'searching', ?, ?)
  `).run(id(), user.id, day, day, user.travel_radius_miles ?? 10, booking.id, new Date(deadline).toISOString(), nowIso());
  db.prepare("UPDATE pairings SET bail_choice = 'rematch' WHERE id = ?").run(pairing.id);
  return { choice };
});

function submitBailDecision(user, pairingId, choice) {
  const result = bailDecision(user, pairingId, choice);
  if (choice === 'rematch') runMatching();
  return result;
}

// ── Shift day: org check-in, no-shows, attendance ──

function updateVolunteerHistory(userId, shift) {
  const user = getUser(userId);
  const hours = (Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / clock.HOUR;
  const history = safeParseArray(user.volunteer_history);
  const day = localDate(new Date(shift.starts_at), shift.timezone);
  let entry = history.find((h) => h.org_id === shift.org_id);
  if (!entry) {
    entry = { org_id: shift.org_id, org_name: shift.org.name, shift_count: 0, first_shift_date: day, last_shift_date: day, org_cause_tags: shift.org.mission_tags };
    history.push(entry);
  }
  entry.shift_count += 1;
  entry.last_shift_date = day;
  const experienced = new Set(safeParseArray(user.cause_tags_experienced));
  shift.cause_tags.forEach((tag) => experienced.add(tag));
  db.prepare(`
    UPDATE users SET volunteer_history = ?, total_volunteer_hours = total_volunteer_hours + ?, cause_tags_experienced = ?,
      volunteering_since = COALESCE(volunteering_since, ?) WHERE id = ?
  `).run(JSON.stringify(history), Math.round(hours * 100) / 100, JSON.stringify([...experienced]), day, userId);
}

function orgBooking(org, bookingId) {
  const booking = getBooking(bookingId);
  const shift = booking && getShift(booking.shift_id);
  if (!shift || shift.org_id !== org.id) throw new LifecycleError('not_found', 'Booking not found.', 404);
  return { booking, shift };
}

const checkIn = db.transaction((org, bookingId) => {
  const { booking, shift } = orgBooking(org, bookingId);
  if (booking.status === 'attended') return booking;
  if (booking.status !== 'confirmed') throw new LifecycleError('not_checkable', 'This volunteer is not booked on this shift.');
  if (clock.nowMs() < Date.parse(shift.starts_at) - 2 * clock.HOUR) {
    throw new LifecycleError('too_early', 'Check-in opens two hours before the shift starts.');
  }
  const now = nowIso();
  if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'returned', 'attended', shift.org_id);
  db.prepare("UPDATE bookings SET status = 'attended', checked_in_at = ?, resolved_at = ? WHERE id = ?").run(now, now, booking.id);
  reliability.record(booking.user_id, 'attended', booking.id);
  updateVolunteerHistory(booking.user_id, shift);
  notify(booking.user_id, 'checked_in', "You're checked in",
    `${shift.org.name} checked you in.${booking.hold_id ? ' Your Deeds are back in your balance.' : ''} Have a great shift!`, { type: 'booking', id: booking.id });
  completePairingIfResolved(booking.pairing_id);
  return getBooking(booking.id);
});

const markNoShow = db.transaction((org, bookingId) => {
  const { booking, shift } = orgBooking(org, bookingId);
  if (booking.status === 'no_show') return booking;
  if (booking.status !== 'confirmed') throw new LifecycleError('not_markable', 'Only booked volunteers can be marked as no-shows.');
  if (clock.nowMs() < Date.parse(shift.starts_at)) throw new LifecycleError('too_early', "You can mark a no-show once the shift has started.");
  if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'forfeited', 'no_show', shift.org_id);
  db.prepare("UPDATE bookings SET status = 'no_show', resolved_at = ? WHERE id = ?").run(nowIso(), booking.id);
  reliability.record(booking.user_id, 'no_show', booking.id);
  completePairingIfResolved(booking.pairing_id);
  return getBooking(booking.id);
});

function completePairingIfResolved(pairingId) {
  if (!pairingId) return;
  const pairing = getPairing(pairingId);
  if (!pairing || pairing.status !== 'confirmed') return;
  // Completion (and the rating prompt) waits for the shift to end, so
  // starters keep arriving for a pair who both checked in early.
  if (Date.parse(getShift(pairing.shift_id).ends_at) > clock.nowMs()) return;
  const { a, b } = bookingsOf(pairing);
  const resolved = (bk) => ['attended', 'no_show', 'unverified', 'cancelled'].includes(bk.status) || bk.pairing_id !== pairing.id;
  if (!resolved(a) || !resolved(b)) return;
  db.prepare("UPDATE pairings SET status = 'completed', ended_at = ? WHERE id = ?").run(nowIso(), pairing.id);
  for (const bk of [a, b]) {
    if (bk.status === 'attended' || bk.status === 'unverified') {
      notify(bk.user_id, 'rate_shift', 'How did it go?', 'Rate the shift and your partner — it takes a few seconds.', { type: 'booking', id: bk.id });
    }
  }
}

// ── Time-based transitions ──

function tick() {
  const nowMs = clock.nowMs();
  const now = new Date(nowMs).toISOString();

  // Proposals nobody (or only one side) answered in time.
  for (const pairing of db.prepare("SELECT * FROM pairings WHERE status = 'proposed' AND proposal_expires_at <= ?").all(now)) {
    db.transaction(() => endProposal(pairing, 'expired', null))();
  }

  // Backed-out-on partners who didn't choose in time: Deeds released and
  // the booking cancelled (the safe default — they never pay).
  for (const pairing of db.prepare(`
    SELECT * FROM pairings WHERE status = 'cancelled' AND bail_user_id IS NOT NULL AND bail_choice IS NULL AND bail_deadline <= ?
  `).all(now)) {
    db.transaction(() => {
      const side = pairing.bail_user_id === pairing.user_a_id ? 'a' : 'b';
      const booking = getBooking(pairing[`booking_${side}_id`]);
      const shift = getShift(pairing.shift_id);
      if (booking.status === 'confirmed') releaseAndCancel(booking, shift, 'partner_released', 'bail_no_response');
      db.prepare("UPDATE pairings SET bail_choice = 'no_response_release' WHERE id = ?").run(pairing.id);
      notify(pairing.bail_user_id, 'bail_released', 'Your Deeds are back',
        `We didn't hear back in time, so we've cancelled your spot for ${shift.when_label} and released your Deeds in full.`);
    })();
  }

  // Searches that hit their deadline.
  for (const request of db.prepare("SELECT * FROM availability_requests WHERE status = 'searching' AND search_deadline <= ?").all(now)) {
    db.transaction(() => {
      db.prepare("UPDATE availability_requests SET status = 'no_match', ended_at = ? WHERE id = ?").run(now, request.id);
      const booking = request.anchor_booking_id ? getBooking(request.anchor_booking_id) : null;
      if (request.kind === 'rematch' && booking?.status === 'confirmed') {
        const shift = getShift(booking.shift_id);
        keepSpotSoloAfterRelease(booking, shift, 'no_rematch_found');
        notify(request.user_id, 'rematch_failed', "We couldn't find a new partner in time",
          `Your Deeds for ${shift.when_label} are released in full. Your spot is still yours if you'd like to go solo — or cancel it, free.`,
          { type: 'booking', id: booking.id });
      } else if (request.kind === 'solo_rsvp') {
        notify(request.user_id, 'solo_no_partner', 'Going solo this time',
          "We couldn't find a partner for your solo RSVP before the shift. Your spot is still booked — enjoy it!");
      } else {
        notify(request.user_id, 'no_match', "We couldn't find a match this time",
          'Nothing lined up in your window. We have a few ideas to make the next search faster.');
      }
    })();
  }

  // Conversation starters, spread across each confirmed pairing's shift.
  for (const pairing of db.prepare(`
    SELECT p.* FROM pairings p JOIN shifts s ON s.id = p.shift_id
    WHERE p.status = 'confirmed' AND p.starters_sent < ? AND s.starts_at <= ? AND s.ends_at > ?
  `).all(rules.STARTERS_PER_SHIFT, now, now)) {
    const shift = getShift(pairing.shift_id);
    const start = Date.parse(shift.starts_at);
    const step = (Date.parse(shift.ends_at) - start) / rules.STARTERS_PER_SHIFT;
    const due = Math.min(rules.STARTERS_PER_SHIFT, Math.floor((nowMs - start) / step) + 1);
    for (let i = pairing.starters_sent; i < due; i++) {
      chat.post(pairing.id, { kind: 'starter', body: chat.starterFor(shift, i) });
    }
    db.prepare('UPDATE pairings SET starters_sent = ? WHERE id = ?').run(due, pairing.id);
  }

  // Pairings whose shift has ended and whose attendance is all recorded.
  for (const pairing of db.prepare(`
    SELECT p.id FROM pairings p JOIN shifts s ON s.id = p.shift_id WHERE p.status = 'confirmed' AND s.ends_at <= ?
  `).all(now)) {
    db.transaction(() => completePairingIfResolved(pairing.id))();
  }

  // Bookings the org never marked: resolved without penalty and without
  // verified hours, a day after the shift ends.
  for (const booking of db.prepare(`
    SELECT b.* FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.status = 'confirmed' AND s.ends_at <= ?
  `).all(new Date(nowMs - rules.ATTENDANCE_AUTO_RESOLVE_MS).toISOString())) {
    db.transaction(() => {
      const shift = getShift(booking.shift_id);
      if (booking.hold_id) deeds.resolveHold(booking.hold_id, 'released', 'attendance_unverified', shift.org_id);
      db.prepare("UPDATE bookings SET status = 'unverified', resolved_at = ? WHERE id = ?").run(now, booking.id);
      completePairingIfResolved(booking.pairing_id);
    })();
  }

  return runMatching(nowMs);
}

// ── Alternatives offered while waiting / after no match ──

function alternatives(user, request) {
  const nowMs = clock.nowMs();
  const shifts = visibleShifts(new Date(nowMs + rules.MIN_LEAD_MS).toISOString()).filter((s) => s.capacity_remaining >= 1);
  const causes = safeParseArray(user.cause_tags);
  const aligned = (s) => computeAlignment(causes, s).score >= 0.5;
  const inWindow = (s) => {
    const day = localDate(new Date(s.starts_at), s.timezone);
    return day >= request.window_start && day <= request.window_end;
  };
  const radius = request.travel_radius_miles ?? user.travel_radius_miles;
  const distance = (s) => (user.location_lat != null && s.location
    ? haversineMiles({ lat: user.location_lat, lng: user.location_lng }, s.location) : null);
  const withinRadius = (s) => distance(s) == null || radius == null || distance(s) <= radius;

  const result = [];
  const solo = shifts.filter((s) => aligned(s) && inWindow(s) && withinRadius(s)).slice(0, 3);
  if (solo.length) {
    result.push({
      type: 'solo_rsvp',
      title: 'RSVP solo',
      body: "Book a spot now — we'll still try to pair you with someone before it starts.",
      shifts: solo.map(shiftSummary),
    });
  }
  const farther = shifts.filter((s) => aligned(s) && inWindow(s) && !withinRadius(s)).map(distance).filter((d) => d != null).sort((a, b) => a - b);
  if (farther.length) {
    const miles = Math.ceil(farther[0]);
    result.push({ type: 'widen_radius', title: `Travel up to ${miles} miles`, body: 'There are matching shifts just outside your current distance.', travel_radius_miles: miles });
  }
  const outside = shifts.filter((s) => aligned(s) && withinRadius(s) && !inWindow(s)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (outside.length) {
    const day = localDate(new Date(outside[0].starts_at), outside[0].timezone);
    result.push({ type: 'nearby_date', title: 'Try nearby dates', body: `There are shifts that fit you around ${day}.`, window_start: day, window_end: addDays(day, 3) });
  }
  // The cause area with the most open spots in the user's window that they
  // haven't picked — density makes matching faster.
  const density = {};
  for (const s of shifts.filter(inWindow)) {
    for (const tag of s.cause_tags) if (!causes.includes(tag)) density[tag] = (density[tag] ?? 0) + s.capacity_remaining;
  }
  const busiest = Object.entries(density).sort((a, b) => b[1] - a[1])[0];
  if (busiest) {
    result.push({ type: 'add_cause', title: `Add ${busiest[0]}`, body: 'More shifts are open in this cause right now, so matches tend to come faster.', cause: busiest[0] });
  }
  return result;
}

function shiftSummary(shift) {
  return {
    id: shift.id,
    title: shift.title,
    org_name: shift.org.name,
    org_id: shift.org_id,
    cause_tags: shift.cause_tags,
    when_label: shift.when_label,
    starts_at: shift.starts_at,
    ends_at: shift.ends_at,
    location_label: shift.location_label,
    description: shift.description,
    capacity_remaining: shift.capacity_remaining,
  };
}

const STATUS_COPY = {
  searching: "We're checking new shifts and new volunteers as they come in.",
  no_shift_in_shared_causes: "No listed shifts match your causes, dates and distance yet. We'll keep checking as orgs add more.",
  no_capacity_in_window: "Shifts that fit you are full on your dates right now. We'll keep checking as spots open up.",
  no_compatible_partner_in_radius: "We've found shifts that fit — now looking for a partner nearby with overlapping causes.",
  waiting_for_buddy: "Waiting for your buddy to pick the same dates. You can open this up to a new partner anytime.",
  verification_incomplete: BLOCK_MESSAGES.verification_incomplete,
  monthly_cap_reached: BLOCK_MESSAGES.monthly_cap_reached,
  matching_paused: BLOCK_MESSAGES.matching_paused,
  account_review: BLOCK_MESSAGES.account_review,
  ineligible_data_incomplete: BLOCK_MESSAGES.ineligible_data_incomplete,
  ineligible_age: BLOCK_MESSAGES.ineligible_age,
};

// The honest waiting status for the app's waiting screen.
function requestStatus(user) {
  let request = openRequest(user.id);
  if (!request) {
    request = db.prepare(`
      SELECT * FROM availability_requests WHERE user_id = ? AND status = 'no_match' AND dismissed_at IS NULL AND kind = 'standard'
      ORDER BY created_at DESC LIMIT 1
    `).get(user.id);
  }
  if (!request) return null;
  const nowMs = clock.nowMs();
  const waitedMs = nowMs - clock.parseTime(request.created_at);
  const proposal = request.status === 'proposed'
    ? db.prepare(`SELECT id FROM pairings WHERE status = 'proposed' AND (request_a_id = ? OR request_b_id = ?)`).get(request.id, request.id)
    : null;
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    window_start: request.window_start,
    window_end: request.window_end,
    travel_radius_miles: request.travel_radius_miles,
    buddy_name: request.buddy_user_id ? getUser(request.buddy_user_id)?.display_name : null,
    created_at: request.created_at,
    search_deadline: request.search_deadline,
    waited_hours: Math.floor(waitedMs / clock.HOUR),
    taking_longer: waitedMs >= rules.WAIT_SOFT_MS,
    reason: request.last_reason,
    headline: request.status === 'no_match'
      ? "We couldn't find a match this time"
      : 'Looking for your volunteer partner and a spot nearby…',
    detail: request.status === 'no_match'
      ? "We'd rather tell you honestly than rush a pairing that doesn't fit. Here are a few ways to make the next search faster."
      : STATUS_COPY[request.last_reason] ?? STATUS_COPY.searching,
    proposal_pairing_id: proposal?.id ?? null,
    alternatives: request.status === 'proposed' ? [] : alternatives(user, request),
  };
}

function dismissNoMatch(user) {
  db.prepare(`
    UPDATE availability_requests SET dismissed_at = ? WHERE user_id = ? AND status = 'no_match' AND dismissed_at IS NULL
  `).run(nowIso(), user.id);
}

module.exports = {
  LifecycleError,
  openRequest,
  submitRequest,
  cancelRequest,
  adjustRequest,
  rsvpSolo,
  requestStatus,
  dismissNoMatch,
  confirm,
  submitDecline,
  cancelPreview,
  cancelBooking,
  submitBailDecision,
  checkIn,
  markNoShow,
  completePairingIfResolved,
  tick,
  shiftSummary,
  activeBuddyIds,
  getBooking,
  getPairing,
  getUser,
  sideOf,
  requirePairingMember,
  hoursUntil,
};
