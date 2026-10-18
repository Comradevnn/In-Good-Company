// Runs matching over every open availability request against the real
// orgs/shifts tables. The pure checks and ranking live in matching/: this
// file adds everything that needs the database — eligibility (verification,
// age, monthly cap, reliability pause), each request's eligible shifts,
// existing bookings, prior-pairing history and the live capacity counter.
//
// Each run reads one snapshot of the pool, asks matching/assign.js for a
// plan (best pairings first across the whole pool, with rematches and
// searches near their deadline served first), then writes the proposals.
// capacity is still reserved atomically per proposal, so the database stays
// the authority on spots.
//
// The whole run is one IMMEDIATE transaction, so two runs (or a run and a
// solo RSVP, in another process) serialize instead of interleaving.
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const premium = require('./premium');
const reliability = require('./reliability');
const { notify } = require('./notify');
const { passesShiftGate, safeParseArray } = require('../matching/engine');
const { MATCHING_CONFIG } = require('../matching/config');
const { toMatchPerson } = require('../matching/person');
const { orgQuality } = require('../matching/score');
const { planAssignments, pairKey, roundBreakdown } = require('../matching/assign');
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

function createProposal(ctxA, ctxB, shift, flags, nowMs, score = null) {
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
    INSERT INTO pairings (id, user_a_id, user_b_id, shift_id, status, score, score_breakdown, booking_a_id, booking_b_id,
      request_a_id, request_b_id, origin, reasoning, flags, proposed_at, proposal_expires_at)
    VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(pairingId, ctxA.user.id, ctxB.user.id, shift.id, score ? Math.round(score.quality * 1000) / 1000 : null,
    score ? JSON.stringify(roundBreakdown(score.breakdown)) : null, bookingA, bookingB, ctxA.request.id, ctxB.request.id,
    origin, describeReasoning(shift, ctxA.user, ctxB.user, flags), JSON.stringify(flags), now, expiresAt);

  for (const ctx of [ctxA, ctxB]) {
    db.prepare("UPDATE availability_requests SET status = 'proposed', last_reason = NULL, last_checked_at = ? WHERE id = ?")
      .run(now, ctx.request.id);
    const other = ctx === ctxA ? ctxB.user : ctxA.user;
    notify(ctx.user.id, 'proposal', ctx.request.kind === 'rematch' ? 'We found you a new partner' : 'We found you a shift',
      `${shift.org.name}, ${shift.when_label}, with ${other.display_name}. Take a look and confirm.`,
      { type: 'pairing', id: pairingId });
  }
  logMatch(`proposed ${ctxA.user.display_name} + ${ctxB.user.display_name} for "${shift.title}" at ${shift.org.name} (${shift.when_label}); ${liveRemaining(shift.id)} spot(s) left${score ? `; fit ${score.quality.toFixed(2)}` : ''}`);
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

// Bulk reads for the whole pool, keyed for the planner.
function poolStats(userIds) {
  const ids = JSON.stringify(userIds);
  const attended = new Map(userIds.map((id) => [id, { total: 0, byCause: {} }]));
  for (const row of db.prepare(`
    SELECT b.user_id, s.cause_tags FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.status = 'attended' AND b.user_id IN (SELECT value FROM json_each(?))
  `).all(ids)) {
    const entry = attended.get(row.user_id);
    entry.total++;
    for (const tag of new Set(safeParseArray(row.cause_tags))) entry.byCause[tag] = (entry.byCause[tag] ?? 0) + 1;
  }
  const events = new Map(userIds.map((id) => [id, { attended: 0, late: 0, noShow: 0 }]));
  for (const row of db.prepare(`
    SELECT user_id, kind, COUNT(*) AS n FROM reliability_events
    WHERE user_id IN (SELECT value FROM json_each(?)) GROUP BY user_id, kind
  `).all(ids)) {
    const entry = events.get(row.user_id);
    if (row.kind === 'attended') entry.attended = row.n;
    else if (row.kind === 'late_cancel') entry.late = row.n;
    else if (row.kind === 'no_show') entry.noShow = row.n;
  }
  const ratings = new Map(userIds.map((id) => [id, []]));
  for (const row of db.prepare(`
    SELECT r.user_id, r.org_id, r.personal_fit, s.cause_tags FROM volunteer_org_ratings r
    LEFT JOIN shifts s ON s.id = r.shift_id WHERE r.user_id IN (SELECT value FROM json_each(?))
  `).all(ids)) {
    ratings.get(row.user_id).push({ orgId: row.org_id, personalFit: row.personal_fit, causeTags: safeParseArray(row.cause_tags) });
  }
  const orgRatings = new Map(userIds.map((id) => [id, []]));
  for (const row of db.prepare(`
    SELECT user_id, attendance, contribution FROM org_volunteer_ratings WHERE user_id IN (SELECT value FROM json_each(?))
  `).all(ids)) orgRatings.get(row.user_id).push({ attendance: row.attendance, contribution: row.contribution });
  const pairSet = (sql) => new Set(db.prepare(sql).all(ids, ids).map((r) => pairKey(r.u1, r.u2)));
  const pairFacts = {
    prior: pairSet(`SELECT user_a_id AS u1, user_b_id AS u2 FROM pairings WHERE status IN ('confirmed', 'completed', 'cancelled')
      AND user_a_id IN (SELECT value FROM json_each(?)) AND user_b_id IN (SELECT value FROM json_each(?))`),
    active: pairSet(`SELECT user_a_id AS u1, user_b_id AS u2 FROM pairings WHERE status IN ('proposed', 'confirmed')
      AND user_a_id IN (SELECT value FROM json_each(?)) AND user_b_id IN (SELECT value FROM json_each(?))`),
    // Either side said they wouldn't volunteer with the other again → they
    // are not paired again (a safety report is the stronger, permanent version).
    declined: pairSet(`SELECT rater_user_id AS u1, ratee_user_id AS u2 FROM partner_ratings WHERE volunteer_again = 0
      AND rater_user_id IN (SELECT value FROM json_each(?)) AND ratee_user_id IN (SELECT value FROM json_each(?))`),
  };
  return { attended, events, ratings, orgRatings, pairFacts };
}

// Read: everything the planner needs, once per run.
function buildSnapshot(nowMs, cfg = MATCHING_CONFIG) {
  const requests = db.prepare(`
    SELECT * FROM availability_requests WHERE status = 'searching'
    ORDER BY CASE kind WHEN 'rematch' THEN 0 ELSE 1 END, created_at
  `).all();
  const allShifts = requests.length ? visibleShifts(new Date(nowMs).toISOString()) : [];
  const contexts = requests.map((request) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.user_id);
    return { request, user, block: user ? eligibilityBlock(user, request, nowMs) : 'ineligible_data_incomplete' };
  }).filter((ctx) => ctx.user);

  const shiftById = new Map(allShifts.map((s) => [s.id, s]));
  for (const ctx of contexts) {
    ctx.shifts = ctx.block ? [] : shiftsFor(ctx, nowMs, allShifts);
    if (ctx.request.anchor_booking_id) {
      // An anchored request's own booking doesn't count as an overlap.
      const mine = activeBookings(ctx.user.id);
      ctx.shifts = ctx.shifts.filter((shift) => !overlaps(shift, mine, ctx.request.anchor_booking_id));
    }
    for (const shift of ctx.shifts) if (!shiftById.has(shift.id)) shiftById.set(shift.id, shift);
  }

  // How well run volunteers rate each org (the public operational axis).
  const orgStats = new Map(db.prepare('SELECT org_id, SUM(operational) AS sum, COUNT(*) AS n FROM volunteer_org_ratings GROUP BY org_id')
    .all().map((r) => [r.org_id, { sum: r.sum, n: r.n }]));
  const shifts = [...shiftById.values()].map((s) => ({ ...s, org_quality: orgQuality(orgStats.get(s.org_id), cfg) }));

  const open = contexts.filter((ctx) => !ctx.block);
  const stats = poolStats([...new Set(open.map((ctx) => ctx.user.id))]);
  const persons = open.map((ctx) => {
    const attended = stats.attended.get(ctx.user.id);
    ctx.person = toMatchPerson(ctx.user, ctx.request, {
      attendedShifts: attended.total,
      attendedByCause: attended.byCause,
      reliability: stats.events.get(ctx.user.id),
      ratings: stats.ratings.get(ctx.user.id),
      orgRatings: stats.orgRatings.get(ctx.user.id),
      eligibleShiftIds: ctx.shifts.map((s) => s.id),
      anchorShiftId: anchorShiftId(ctx.request),
    }, cfg);
    return ctx.person;
  });
  return { nowMs, cfg, contexts, persons, shifts, pairFacts: stats.pairFacts };
}

// Write the plan (planAssignments in matching/assign.js builds it).
function commitPlan(plan, snapshot, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  const byRequest = new Map(snapshot.contexts.map((ctx) => [ctx.request.id, ctx]));
  const shiftById = new Map(snapshot.shifts.map((s) => [s.id, s]));
  const setReason = (ctx, reason) => db.prepare('UPDATE availability_requests SET last_reason = ?, last_checked_at = ? WHERE id = ?')
    .run(reason, nowIso, ctx.request.id);

  for (const ctx of snapshot.contexts) if (ctx.block) setReason(ctx, ctx.block);

  const handled = new Set();
  const proposals = [];
  for (const match of plan.matches) {
    const ctxA = byRequest.get(match.aRequestId);
    const ctxB = byRequest.get(match.bRequestId);
    const shift = getShift(match.shiftId) ?? shiftById.get(match.shiftId);
    const flags = [...match.flags];
    const closeA = passesShiftGate(ctxA.user, shift).alignment.closeMatchUsed;
    const closeB = passesShiftGate(ctxB.user, shift).alignment.closeMatchUsed;
    if (closeA || closeB) flags.push('close_match_alignment_used');
    const pairingId = createProposal(ctxA, ctxB, shift, flags, nowMs, match);
    if (!pairingId) continue; // capacity changed underneath us; both stay searching
    handled.add(ctxA.request.id);
    handled.add(ctxB.request.id);
    proposals.push(pairingId);
  }

  for (const ctx of snapshot.contexts) {
    if (ctx.block || handled.has(ctx.request.id)) continue;
    setReason(ctx, noMatchReason(ctx, ctx.shifts));
  }
  return { proposals };
}

function runOnce(nowMs) {
  const snapshot = buildSnapshot(nowMs);
  if (snapshot.contexts.length === 0) return { proposals: [] };
  const plan = planAssignments({ persons: snapshot.persons, shifts: snapshot.shifts, pairFacts: snapshot.pairFacts, nowMs, config: snapshot.cfg });
  return commitPlan(plan, snapshot, nowMs);
}

// Read-only: what a run would do right now, with every candidate's score
// breakdown. Admin-only (routes/admin.js); never shown to volunteers or orgs.
function previewMatching(nowMs = clock.nowMs()) {
  const snapshot = buildSnapshot(nowMs);
  const plan = planAssignments({ persons: snapshot.persons, shifts: snapshot.shifts, pairFacts: snapshot.pairFacts, nowMs, config: snapshot.cfg });
  return { snapshot, plan };
}

const runTx = db.transaction((nowMs) => runOnce(nowMs));

function runMatching(nowMs = clock.nowMs()) {
  return runTx.immediate(nowMs);
}

module.exports = { runMatching, eligibilityBlock, shiftsFor, activeBookings, overlaps, logMatch, buildSnapshot, previewMatching };
