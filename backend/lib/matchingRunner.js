// Runs the matching engine over every open availability request against the
// real orgs/shifts tables. The pure checks live in matching/engine.js; this
// file adds everything that needs the database: eligibility (verification,
// age, monthly cap, reliability pause), the live capacity counter, existing
// bookings, prior-pairing history, buddy requests and safety flags.
//
// Order is deterministic and fairness-based rather than score-based: the
// longest-waiting request is served first (rematches ahead of everything,
// since they are time-critical), and for each request the candidate list
// prefers a mutual buddy request, then someone the user has never been
// paired with, then whoever has been waiting longest. Shifts are tried
// earliest-first. The spec's weighted soft ranking is not implemented — see
// README "Not built yet".
//
// The whole run is one IMMEDIATE transaction, so two runs (or a run and a
// solo RSVP, in another process) serialize instead of interleaving.
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const premium = require('./premium');
const reliability = require('./reliability');
const { notify } = require('./notify');
const { hardFiltersPass, passesShiftGate, safeParseArray } = require('../matching/engine');
const { visibleShifts, getShift, reserveSpots } = require('./shifts');
const { localDate } = require('./time');

function logMatch(line) {
  if (process.env.MATCHING_LOG !== 'off') console.log(`[matching] ${line}`);
}

// Why a user can't be matched right now, or null. Order matters: an
// unverified user's real blocker is verification, whatever else is true.
function eligibilityBlock(user, request, nowMs) {
  if (!user.verified) return 'verification_incomplete';
  if (user.age == null || safeParseArray(user.cause_tags).length === 0 || !user.gender_pref) return 'ineligible_data_incomplete';
  if (user.age < rules.MIN_AGE) return 'ineligible_age';
  const block = reliability.matchingBlock(user, nowMs);
  if (block) return block.code;
  // A rematch keeps a booking that already counts toward the cap.
  if (request.kind !== 'rematch') {
    const cap = premium.capStatus(user, nowMs);
    if (cap.used + cap.pending >= cap.cap) return 'monthly_cap_reached';
  }
  return null;
}

function activeBookings(userId) {
  return db.prepare(`
    SELECT b.*, s.starts_at, s.ends_at FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.user_id = ? AND b.status IN ('proposed', 'confirmed')
  `).all(userId);
}

function overlaps(shift, bookings, ignoreBookingId) {
  return bookings.some((b) => b.id !== ignoreBookingId && b.starts_at < shift.ends_at && shift.starts_at < b.ends_at);
}

// Orgs this user privately rated a poor personal fit: their shifts sort last
// for this user (never excluded, never visible to anyone else).
function lowFitOrgIds(userId) {
  return new Set(db.prepare('SELECT DISTINCT org_id FROM volunteer_org_ratings WHERE user_id = ? AND personal_fit <= 2')
    .all(userId).map((r) => r.org_id));
}

// Shifts this request could go to, ignoring capacity (that's checked live).
function shiftsFor(ctx, nowMs, allShifts) {
  const { user, request } = ctx;
  if (request.anchor_booking_id) {
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(request.anchor_booking_id);
    const shift = booking ? getShift(booking.shift_id) : null;
    const lastProposalMs = shift ? Date.parse(shift.starts_at) - rules.REMATCH_LAST_PROPOSAL_BEFORE_SHIFT_MS : 0;
    return shift && shift.org.verified && shift.status === 'open' && nowMs < lastProposalMs ? [shift] : [];
  }
  const excluded = new Set(safeParseArray(request.excluded_shift_ids));
  const mine = activeBookings(user.id);
  const lowFit = lowFitOrgIds(user.id);
  const gateUser = { ...user, travel_radius_miles: request.travel_radius_miles ?? user.travel_radius_miles };
  return allShifts
    .filter((shift) => {
      if (excluded.has(shift.id)) return false;
      if (Date.parse(shift.starts_at) < nowMs + rules.MIN_LEAD_MS) return false;
      const day = localDate(new Date(shift.starts_at), shift.timezone);
      if (day < request.window_start || day > request.window_end) return false;
      if (overlaps(shift, mine)) return false;
      return passesShiftGate(gateUser, shift).pass;
    })
    .sort((a, b) => (lowFit.has(a.org_id) - lowFit.has(b.org_id)) || a.starts_at.localeCompare(b.starts_at));
}

function pairedBefore(userA, userB) {
  return Boolean(db.prepare(`
    SELECT 1 FROM pairings WHERE status IN ('confirmed', 'completed', 'cancelled')
      AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
  `).get(userA, userB, userB, userA));
}

// Either side said they wouldn't volunteer with the other again → they are
// not paired again. (A safety report is the stronger, permanent version,
// enforced by hardFiltersPass via flagged_users.)
function declinedEachOther(userA, userB) {
  return Boolean(db.prepare(`
    SELECT 1 FROM partner_ratings WHERE volunteer_again = 0
      AND ((rater_user_id = ? AND ratee_user_id = ?) OR (rater_user_id = ? AND ratee_user_id = ?))
  `).get(userA, userB, userB, userA));
}

function activePairingBetween(userA, userB) {
  return Boolean(db.prepare(`
    SELECT 1 FROM pairings WHERE status IN ('proposed', 'confirmed')
      AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
  `).get(userA, userB, userB, userA));
}

function ageBandOk(request, other) {
  if (request.age_min != null && other.age < request.age_min) return false;
  if (request.age_max != null && other.age > request.age_max) return false;
  return true;
}

function anchorShiftId(request) {
  if (!request.anchor_booking_id) return null;
  return db.prepare('SELECT shift_id FROM bookings WHERE id = ?').get(request.anchor_booking_id)?.shift_id ?? null;
}

function liveRemaining(shiftId) {
  const row = db.prepare('SELECT capacity_total - capacity_booked AS n FROM shifts WHERE id = ?').get(shiftId);
  return row ? row.n : 0;
}

function describeReasoning(shift, a, b, flags) {
  const shared = shift.cause_tags.join(', ');
  const parts = [`Both volunteers' causes align with this ${shared} shift and it falls inside both of their dates and travel distance.`];
  if (flags.includes('buddy_pairing')) parts.push('They asked to volunteer together again as buddies.');
  else if (!flags.includes('repeat_pair')) parts.push('They have not been paired before.');
  return parts.join(' ');
}

function createProposal(ctxA, ctxB, shift, flags, nowMs) {
  const need = (ctxA.request.anchor_booking_id ? 0 : 1) + (ctxB.request.anchor_booking_id ? 0 : 1);
  if (!reserveSpots(shift.id, need)) return null;

  const crypto = require('node:crypto');
  const pairingId = crypto.randomBytes(16).toString('hex');
  const now = new Date(nowMs).toISOString();
  const bookingFor = (ctx) => {
    if (ctx.request.anchor_booking_id) return ctx.request.anchor_booking_id;
    const id = crypto.randomBytes(16).toString('hex');
    db.prepare(`
      INSERT INTO bookings (id, user_id, shift_id, pairing_id, kind, status, created_at)
      VALUES (?, ?, ?, ?, 'paired', 'proposed', ?)
    `).run(id, ctx.user.id, shift.id, pairingId, now);
    return id;
  };
  const bookingA = bookingFor(ctxA);
  const bookingB = bookingFor(ctxB);

  const startMs = Date.parse(shift.starts_at);
  const isRematch = ctxA.request.kind === 'rematch' || ctxB.request.kind === 'rematch';
  const lastResponseMs = startMs - (isRematch ? rules.REMATCH_LAST_PROPOSAL_BEFORE_SHIFT_MS : rules.PROPOSAL_LAST_RESPONSE_BEFORE_SHIFT_MS);
  const expiresAt = new Date(Math.min(nowMs + rules.PROPOSAL_RESPONSE_MS, lastResponseMs)).toISOString();
  const origin = flags.includes('buddy_pairing') ? 'buddy'
    : isRematch ? 'rematch'
      : (ctxA.request.kind === 'solo_rsvp' || ctxB.request.kind === 'solo_rsvp') ? 'solo_rsvp' : 'match';

  db.prepare(`
    INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status, score, booking_a_id, booking_b_id,
      request_a_id, request_b_id, origin, reasoning, flags, proposed_at, proposal_expires_at)
    VALUES (?, ?, ?, ?, 'proposed', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(pairingId, ctxA.user.id, ctxB.user.id, shift.id, bookingA, bookingB, ctxA.request.id, ctxB.request.id,
    origin, describeReasoning(shift, ctxA.user, ctxB.user, flags), JSON.stringify(flags), now, expiresAt);

  for (const ctx of [ctxA, ctxB]) {
    db.prepare("UPDATE availability_requests SET status = 'proposed', last_reason = NULL, last_checked_at = ? WHERE id = ?")
      .run(now, ctx.request.id);
    const other = ctx === ctxA ? ctxB.user : ctxA.user;
    notify(ctx.user.id, 'proposal', ctx.request.kind === 'rematch' ? 'We found you a new partner' : 'We found you a shift',
      `${shift.org.name}, ${shift.when_label}, with ${other.display_name}. Take a look and confirm.`,
      { type: 'pairing', id: pairingId });
  }
  logMatch(`proposed ${ctxA.user.display_name} + ${ctxB.user.display_name} for "${shift.title}" at ${shift.org.name} (${shift.when_label}); ${shift.capacity_remaining - need} spot(s) left`);
  return pairingId;
}

function noMatchReason(ctx, myShifts) {
  if (ctx.request.buddy_user_id) return 'waiting_for_buddy';
  if (myShifts.length === 0) return 'no_shift_in_shared_causes';
  const need = ctx.request.anchor_booking_id ? 0 : 1;
  if (!myShifts.some((s) => liveRemaining(s.id) >= need + 1)) {
    // Anchored requests already hold their own spot; the partner needs one.
    return 'no_capacity_in_window';
  }
  return 'no_compatible_partner_in_radius';
}

function runOnce(nowMs) {
  const requests = db.prepare(`
    SELECT * FROM availability_requests WHERE status = 'searching'
    ORDER BY CASE kind WHEN 'rematch' THEN 0 ELSE 1 END, created_at
  `).all();
  if (requests.length === 0) return { proposals: [] };

  const allShifts = visibleShifts(new Date(nowMs).toISOString());
  const contexts = requests.map((request) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user_id);
    return { request, user, block: user ? eligibilityBlock(user, request, nowMs) : 'ineligible_data_incomplete' };
  }).filter((ctx) => ctx.user);
  for (const ctx of contexts) ctx.shifts = ctx.block ? [] : shiftsFor(ctx, nowMs, allShifts);

  const handled = new Set();
  const proposals = [];
  for (const ctx of contexts) {
    if (handled.has(ctx.request.id)) continue;
    if (ctx.block) {
      db.prepare('UPDATE availability_requests SET last_reason = ?, last_checked_at = ? WHERE id = ?')
        .run(ctx.block, new Date(nowMs).toISOString(), ctx.request.id);
      continue;
    }

    const candidates = contexts
      .filter((other) => other !== ctx && !handled.has(other.request.id) && !other.block && other.user.id !== ctx.user.id)
      .filter((other) => {
        const wantsBuddy = ctx.request.buddy_user_id || other.request.buddy_user_id;
        if (wantsBuddy) {
          // Buddy requests pair only when mutual: each asked for the other.
          return ctx.request.buddy_user_id === other.user.id && other.request.buddy_user_id === ctx.user.id;
        }
        return true;
      })
      .filter((other) => {
        // Two anchored requests can only share their (common) anchored shift.
        const a = anchorShiftId(ctx.request);
        const b = anchorShiftId(other.request);
        return !(a && b && a !== b);
      })
      .filter((other) => hardFiltersPass(ctx.user, other.user).pass)
      .filter((other) => ageBandOk(ctx.request, other.user) && ageBandOk(other.request, ctx.user))
      .filter((other) => !declinedEachOther(ctx.user.id, other.user.id) && !activePairingBetween(ctx.user.id, other.user.id))
      .map((other) => ({
        other,
        buddy: Boolean(ctx.request.buddy_user_id),
        repeat: pairedBefore(ctx.user.id, other.user.id),
      }))
      .sort((x, y) => (y.buddy - x.buddy) || (x.repeat - y.repeat) || x.other.request.created_at.localeCompare(y.other.request.created_at));

    let pairingId = null;
    for (const { other, buddy, repeat } of candidates) {
      const otherShiftIds = new Set(other.shifts.map((s) => s.id));
      const shared = ctx.shifts.filter((s) => otherShiftIds.has(s.id) && !overlaps(s, activeBookings(other.user.id), other.request.anchor_booking_id));
      for (const shift of shared) {
        const flags = [];
        if (buddy) flags.push('buddy_pairing');
        if (repeat) flags.push('repeat_pair');
        const closeA = passesShiftGate(ctx.user, shift).alignment.closeMatchUsed;
        const closeB = passesShiftGate(other.user, shift).alignment.closeMatchUsed;
        if (closeA || closeB) flags.push('close_match_alignment_used');
        pairingId = createProposal(ctx, other, shift, flags, nowMs);
        if (pairingId) {
          handled.add(ctx.request.id);
          handled.add(other.request.id);
          proposals.push(pairingId);
          break;
        }
      }
      if (pairingId) break;
    }

    if (!pairingId) {
      const reason = noMatchReason(ctx, ctx.shifts);
      db.prepare('UPDATE availability_requests SET last_reason = ?, last_checked_at = ? WHERE id = ?')
        .run(reason, new Date(nowMs).toISOString(), ctx.request.id);
    }
  }
  return { proposals };
}

const runTx = db.transaction((nowMs) => runOnce(nowMs));

function runMatching(nowMs = clock.nowMs()) {
  return runTx.immediate(nowMs);
}

module.exports = { runMatching, eligibilityBlock, shiftsFor, activeBookings, overlaps, logMatch };
