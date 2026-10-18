// Volunteer-facing lifecycle routes: home summary, availability requests and
// the waiting period, proposals, pairings, cancellation and the "your match
// bailed" choice, chat, ratings, buddies, Deeds/Premium/referrals, safety,
// notifications and personal metrics.
const express = require('express');
const db = require('../db');
const clock = require('../lib/clock');
const rules = require('../lib/rules');
const deeds = require('../lib/deeds');
const premium = require('../lib/premium');
const lifecycle = require('../lib/lifecycle');
const social = require('../lib/social');
const chat = require('../lib/chat');
const metrics = require('../lib/metrics');
const reliability = require('../lib/reliability');
const referrals = require('../lib/referrals');
const services = require('../lib/services');
const { isBlockedPair } = require('../lib/blocks');
const { requireAuth, requireProfile } = require('../lib/auth');
const { getShift, visibleShifts, publicOrg } = require('../lib/shifts');
const { localDate } = require('../lib/time');

const router = express.Router();
const { LifecycleError } = lifecycle;

// Async-safe handler: maps lifecycle/Deeds errors to 4xx JSON responses.
function wrap(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (err) {
      if (err instanceof LifecycleError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
      if (err instanceof deeds.DeedsError) return res.status(400).json({ error: err.message, code: err.code, ...err.extra });
      next(err);
    }
  };
}

// Every volunteer route: signed in, profile exists, and any Premium weekly
// grants that came due since the last request are credited first.
function volunteer(req, res, next) {
  requireAuth(req, res, () => requireProfile(req, res, () => {
    if (premium.applyGrants(req.user) > 0) {
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    }
    next();
  }));
}

// ── Views ──

function bookingView(user, booking) {
  const shift = getShift(booking.shift_id);
  const nowMs = clock.nowMs();
  const pairingId = booking.pairing_id ?? db.prepare(`
    SELECT id FROM pairings WHERE status = 'proposed' AND (booking_a_id = ? OR booking_b_id = ?)
  `).get(booking.id, booking.id)?.id;
  const pairing = pairingId ? lifecycle.getPairing(pairingId) : null;
  let pairingView = null;
  if (pairing) {
    const side = lifecycle.sideOf(pairing, user.id);
    const partnerBooking = lifecycle.getBooking(pairing[`booking_${side.other}_id`]);
    pairingView = {
      id: pairing.id,
      status: pairing.status,
      partner_name: lifecycle.getUser(pairing[`user_${side.other}_id`]).display_name,
      partner_confirmed: partnerBooking.status !== 'proposed' && Boolean(partnerBooking.hold_id),
    };
  }
  return {
    booking_id: booking.id,
    status: booking.status,
    kind: booking.kind,
    confirmed_at: booking.confirmed_at,
    checked_in_at: booking.checked_in_at,
    shift: lifecycle.shiftSummary(shift),
    is_today: localDate(new Date(shift.starts_at), shift.timezone) === localDate(clock.now(), shift.timezone),
    started: Date.parse(shift.starts_at) <= nowMs,
    ended: Date.parse(shift.ends_at) <= nowMs,
    pairing: pairingView,
  };
}

function homeActions(user) {
  const actions = [];
  for (const p of db.prepare(`
    SELECT * FROM pairings WHERE status = 'proposed' AND (user_a_id = ? OR user_b_id = ?)
  `).all(user.id, user.id)) {
    const side = lifecycle.sideOf(p, user.id);
    const mine = lifecycle.getBooking(p[`booking_${side.me}_id`]);
    const mineConfirmed = mine.status === 'confirmed' && mine.kind === 'paired' && Boolean(mine.hold_id);
    actions.push({
      type: mineConfirmed ? 'awaiting_partner' : 'proposal',
      pairing_id: p.id,
      expires_at: p.proposal_expires_at,
      partner_name: lifecycle.getUser(p[`user_${side.other}_id`]).display_name,
      when_label: getShift(p.shift_id).when_label,
    });
  }
  for (const p of db.prepare(`
    SELECT * FROM pairings WHERE status = 'cancelled' AND bail_user_id = ? AND bail_choice IS NULL AND bail_deadline > ?
  `).all(user.id, clock.isoNow())) {
    actions.push({
      type: 'bail_decision',
      pairing_id: p.id,
      deadline: p.bail_deadline,
      partner_name: lifecycle.getUser(p.backed_out_by).display_name,
      when_label: getShift(p.shift_id).when_label,
    });
  }
  for (const b of db.prepare(`
    SELECT b.* FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.user_id = ? AND b.status IN ('attended', 'unverified') AND s.ends_at <= ?
      AND NOT EXISTS (SELECT 1 FROM volunteer_org_ratings r WHERE r.booking_id = b.id)
      AND b.resolved_at > ?
  `).all(user.id, clock.isoNow(), new Date(clock.nowMs() - 14 * clock.DAY).toISOString())) {
    const shift = getShift(b.shift_id);
    actions.push({ type: 'rate', booking_id: b.id, org_name: shift.org.name, when_label: shift.when_label });
  }
  return actions;
}

router.get('/me/home', volunteer, wrap((req, res) => {
  lifecycle.tick();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const bookings = db.prepare(`
    SELECT b.* FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.user_id = ? AND (b.status = 'confirmed' OR (b.status = 'attended' AND s.ends_at > ?))
    ORDER BY s.starts_at
  `).all(user.id, clock.isoNow());
  const m = metrics.userMetrics(user);
  const request = lifecycle.requestStatus(user);
  res.json({
    now: clock.isoNow(),
    // Calendar "today" in the platform timezone — dates the user picks are
    // compared against this, never against the UTC date.
    today: localDate(clock.now()),
    profile: { display_name: user.display_name, verified: Boolean(user.verified), referral_code: referrals.ensureCode(user) },
    deeds: { ...deeds.balances(user.id), shift_price: deeds.shiftPriceDeeds() },
    premium: { ...premium.state(user), cap: premium.capStatus(user), free_late_cancel_available: premium.freeLateCancelAvailable(user) },
    request,
    // Offered on the "find a shift" screen only when a partner looks likely;
    // not worked out when a search is already open (request reports it).
    match_options: { anyone_available: request && ['searching', 'proposed'].includes(request.status)
      ? false : lifecycle.anyonePartnerLikely(user, user.availability_window_start, user.availability_window_end) },
    actions: homeActions(user),
    bookings: bookings.map((b) => bookingView(user, b)),
    buddies: social.listBuddies(user),
    buddy_slots: social.buddySlots(user),
    matching_block: reliability.matchingBlock(user),
    safety_notice_needed: !user.safety_notice_ack_at,
    notifications_unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(user.id).n,
    impact: { shifts: m.shifts_completed, hours: m.hours, orgs: m.orgs },
  });
}));

// ── Availability requests & the waiting period ──

router.post('/requests', volunteer, wrap((req, res) => {
  lifecycle.submitRequest(req.user, req.body ?? {});
  res.status(201).json(lifecycle.requestStatus(lifecycle.getUser(req.user.id)));
}));

router.get('/requests/current', volunteer, wrap((req, res) => {
  lifecycle.tick();
  res.json({ request: lifecycle.requestStatus(lifecycle.getUser(req.user.id)) });
}));

router.post('/requests/current/cancel', volunteer, wrap((req, res) => {
  lifecycle.cancelRequest(req.user);
  res.json({ ok: true });
}));

router.post('/requests/current/adjust', volunteer, wrap((req, res) => {
  lifecycle.adjustRequest(req.user, req.body ?? {});
  lifecycle.tick();
  res.json({ request: lifecycle.requestStatus(lifecycle.getUser(req.user.id)) });
}));

router.post('/requests/current/dismiss', volunteer, wrap((req, res) => {
  lifecycle.dismissNoMatch(req.user);
  res.json({ ok: true });
}));

// Kept for older app builds: runs matching now and returns the caller's
// current search state.
router.post('/matching/run', volunteer, wrap((req, res) => {
  lifecycle.tick();
  res.json({ request: lifecycle.requestStatus(lifecycle.getUser(req.user.id)) });
}));

// ── Shifts & orgs (verified orgs only) ──

router.get('/shifts', volunteer, wrap((req, res) => {
  const cause = req.query.cause;
  const shifts = visibleShifts(clock.isoNow())
    .filter((s) => s.capacity_remaining > 0 && (!cause || s.cause_tags.includes(cause)))
    .slice(0, 50)
    .map(lifecycle.shiftSummary);
  res.json({ shifts });
}));

router.post('/shifts/:id/rsvp-solo', volunteer, wrap((req, res) => {
  const bookingId = lifecycle.rsvpSolo(req.user, req.params.id);
  lifecycle.tick();
  res.status(201).json(bookingView(req.user, lifecycle.getBooking(bookingId)));
}));

router.get('/orgs/:id', requireAuth, wrap((req, res) => {
  const org = db.prepare('SELECT * FROM orgs WHERE id = ? AND verified = 1').get(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organization not found.' });
  const ratings = db.prepare('SELECT operational, COUNT(*) AS n FROM volunteer_org_ratings WHERE org_id = ? GROUP BY operational').all(org.id);
  res.json({
    org: publicOrg(org),
    // Public: the operational axis only. Personal-fit ratings never appear here.
    operational_ratings: Object.fromEntries([1, 2, 3, 4, 5].map((v) => [v, ratings.find((r) => r.operational === v)?.n ?? 0])),
    upcoming_shifts: visibleShifts(clock.isoNow()).filter((s) => s.org_id === org.id).slice(0, 10).map(lifecycle.shiftSummary),
  });
}));

// ── Pairings ──

function pairingDetail(user, pairingId) {
  const { pairing, side } = lifecycle.requirePairingMember(pairingId, user.id);
  const shift = getShift(pairing.shift_id);
  const mine = lifecycle.getBooking(pairing[`booking_${side.me}_id`]);
  const theirs = lifecycle.getBooking(pairing[`booking_${side.other}_id`]);
  const partnerId = pairing[`user_${side.other}_id`];
  const hold = mine.hold_id ? db.prepare('SELECT * FROM deeds_holds WHERE id = ?').get(mine.hold_id) : null;
  const confirmedMine = mine.status === 'confirmed' && mine.kind === 'paired' && Boolean(mine.hold_id) && hold?.status === 'held';
  return {
    now: clock.isoNow(),
    id: pairing.id,
    status: pairing.status,
    origin: pairing.origin,
    proposal_expires_at: pairing.proposal_expires_at,
    confirmed_at: pairing.confirmed_at,
    shift: { ...lifecycle.shiftSummary(shift), org: publicOrg(db.prepare('SELECT * FROM orgs WHERE id = ?').get(shift.org_id)) },
    partner: social.partnerCard(partnerId),
    my_booking: {
      id: mine.id,
      status: mine.status,
      kind: mine.kind,
      confirmed_at: mine.confirmed_at,
      checked_in_at: mine.checked_in_at,
      grace_ends_at: mine.confirmed_at && mine.hold_id ? new Date(clock.parseTime(mine.confirmed_at) + rules.GRACE_WINDOW_MS).toISOString() : null,
      hold: hold ? { amount: hold.amount_free + hold.amount_purchased, status: hold.status } : null,
      in_this_pairing: mine.pairing_id === pairing.id || pairing.status === 'proposed',
    },
    me_confirmed: confirmedMine,
    partner_confirmed: theirs.status !== 'proposed' && Boolean(theirs.hold_id),
    deeds: { price: deeds.shiftPriceDeeds(), available: deeds.balances(user.id).available },
    safety_notice_required: !user.safety_notice_ack_at,
    safety_notice: social.SAFETY_NOTICE,
    bail: pairing.status === 'cancelled' && pairing.bail_user_id === user.id
      ? {
        deadline: pairing.bail_deadline,
        choice: pairing.bail_choice,
        open: !pairing.bail_choice && clock.parseTime(pairing.bail_deadline) > clock.nowMs(),
        backed_out_by_name: lifecycle.getUser(pairing.backed_out_by).display_name,
      }
      : null,
    backed_out_by_me: pairing.backed_out_by === user.id,
    contact_share: { me: Boolean(pairing[`contact_share_${side.me}`]), partner: Boolean(pairing[`contact_share_${side.other}`]) },
    chat_open: ['confirmed', 'completed'].includes(pairing.status) && !isBlockedPair(pairing.user_a_id, pairing.user_b_id),
    chat_closed_reason: isBlockedPair(pairing.user_a_id, pairing.user_b_id) ? 'report'
      : ['confirmed', 'completed'].includes(pairing.status) ? null : 'pairing_ended',
  };
}

router.get('/pairings/:id', volunteer, wrap((req, res) => {
  lifecycle.tick();
  res.json(pairingDetail(lifecycle.getUser(req.user.id), req.params.id));
}));

router.post('/pairings/:id/confirm', volunteer, wrap((req, res) => {
  lifecycle.confirm(req.user, req.params.id, { safetyNoticeAck: req.body?.safety_notice_ack === true });
  res.json(pairingDetail(lifecycle.getUser(req.user.id), req.params.id));
}));

router.post('/pairings/:id/decline', volunteer, wrap((req, res) => {
  lifecycle.submitDecline(req.user, req.params.id, { keepLooking: req.body?.keep_looking !== false });
  res.json({ ok: true, request: lifecycle.requestStatus(lifecycle.getUser(req.user.id)) });
}));

router.post('/pairings/:id/bail-decision', volunteer, wrap((req, res) => {
  const result = lifecycle.submitBailDecision(req.user, req.params.id, req.body?.choice);
  res.json({ ...result, request: lifecycle.requestStatus(lifecycle.getUser(req.user.id)) });
}));

router.get('/pairings/:id/share-plan', volunteer, wrap((req, res) => {
  res.json(social.sharePlan(req.user, req.params.id));
}));

router.post('/pairings/:id/contact-share', volunteer, wrap((req, res) => {
  const { pairing, side } = lifecycle.requirePairingMember(req.params.id, req.user.id);
  if (req.body?.opt_in && isBlockedPair(pairing.user_a_id, pairing.user_b_id)) {
    return res.status(403).json({ error: 'Contact sharing is not available for this pairing.', code: 'chat_blocked' });
  }
  db.prepare(`UPDATE pairings SET contact_share_${side.me} = ? WHERE id = ?`).run(req.body?.opt_in ? 1 : 0, pairing.id);
  const updated = lifecycle.getPairing(pairing.id);
  res.json({ me: Boolean(updated[`contact_share_${side.me}`]), partner: Boolean(updated[`contact_share_${side.other}`]) });
}));

// ── Chat (text only; polled) ──

router.get('/pairings/:id/messages', volunteer, wrap((req, res) => {
  lifecycle.requirePairingMember(req.params.id, req.user.id);
  lifecycle.tick();
  const after = Number(req.query.after) || 0;
  const messages = db.prepare(`
    SELECT id, sender_user_id, kind, body, created_at FROM messages
    WHERE pairing_id = ? AND id > ? AND (visible_to_user_id IS NULL OR visible_to_user_id = ?)
    ORDER BY id
  `).all(req.params.id, after, req.user.id).map((m) => ({
    id: m.id,
    kind: m.kind,
    body: m.body,
    created_at: m.created_at,
    from: m.sender_user_id == null ? 'system' : m.sender_user_id === req.user.id ? 'me' : 'them',
  }));
  res.json({ messages });
}));

router.post('/pairings/:id/messages', volunteer, wrap((req, res) => {
  const { pairing, side } = lifecycle.requirePairingMember(req.params.id, req.user.id);
  if (isBlockedPair(pairing.user_a_id, pairing.user_b_id)) {
    return res.status(403).json({ error: 'This chat is closed.', code: 'chat_blocked' });
  }
  if (!['confirmed', 'completed'].includes(pairing.status)) {
    return res.status(409).json({ error: 'Chat opens once you are both confirmed, and closes if the pairing is cancelled.', code: 'chat_closed' });
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 1000) return res.status(400).json({ error: 'Messages must be 1-1000 characters.' });
  const bothOptedIn = pairing[`contact_share_${side.me}`] && pairing[`contact_share_${side.other}`];
  if (!bothOptedIn && chat.containsContactInfo(body)) {
    return res.status(422).json({
      error: "That looks like contact info. Phone numbers, emails and social handles can be shared once you've both turned on contact sharing.",
      code: 'contact_info_blocked',
    });
  }
  const messageId = chat.post(pairing.id, { kind: 'text', body, senderUserId: req.user.id });
  res.status(201).json({ id: messageId });
}));

// ── Bookings: cancel, ratings ──

router.get('/bookings/:id/cancel-preview', volunteer, wrap((req, res) => {
  res.json(lifecycle.cancelPreview(req.user, req.params.id));
}));

router.post('/bookings/:id/cancel', volunteer, wrap((req, res) => {
  const result = lifecycle.cancelBooking(req.user, req.params.id, { keepSpotSolo: req.body?.keep_spot_solo === true });
  res.json({ ...result, deeds: deeds.balances(req.user.id) });
}));

router.get('/bookings/:id', volunteer, wrap((req, res) => {
  const booking = lifecycle.getBooking(req.params.id);
  if (!booking || booking.user_id !== req.user.id) return res.status(404).json({ error: 'Booking not found.' });
  res.json(bookingView(req.user, booking));
}));

router.get('/bookings/:id/rating-form', volunteer, wrap((req, res) => {
  res.json(social.ratingForm(req.user, req.params.id));
}));

router.post('/bookings/:id/ratings', volunteer, wrap((req, res) => {
  res.json(social.submitRatings(req.user, req.params.id, req.body ?? {}));
}));

router.post('/bookings/:id/org-rating-visibility', volunteer, wrap((req, res) => {
  social.setOrgRatingVisibility(req.user, req.params.id, req.body?.public === true);
  res.json({ ok: true });
}));

// ── Buddies ──

router.get('/buddies', volunteer, wrap((req, res) => {
  res.json({ buddies: social.listBuddies(req.user), slots: social.buddySlots(req.user) });
}));

router.post('/buddies/:id/end', volunteer, wrap((req, res) => {
  social.endBuddy(req.user, req.params.id);
  res.json({ ok: true });
}));

// ── Deeds, Premium, referrals ──

router.get('/deeds', volunteer, wrap((req, res) => {
  res.json({
    ...deeds.balances(req.user.id),
    shift_price: deeds.shiftPriceDeeds(),
    packs: rules.PURCHASE_PACKS.map((n) => ({ deeds: n, usd: (n * rules.CENTS_PER_DEED) / 100 })),
    history: deeds.history(req.user.id),
  });
}));

// Mock purchase — no payment processor, no card data.
router.post('/deeds/purchase', volunteer, wrap((req, res) => {
  deeds.purchase(req.user.id, Number(req.body?.deeds));
  const balances = deeds.balances(req.user.id);
  res.status(200).json({ deeds_balance: balances.available, balances });
}));

router.get('/premium', volunteer, wrap((req, res) => {
  res.json({
    ...premium.state(req.user),
    cap: premium.capStatus(req.user),
    free_late_cancel_available: premium.freeLateCancelAvailable(req.user),
    buddy_slots: social.buddySlots(req.user),
    plans: Object.entries(rules.PREMIUM_PLANS).map(([plan, p]) => ({ plan, usd: p.price_cents / 100, months: p.months })),
    weekly_grant: rules.PREMIUM_WEEKLY_GRANT,
    next_grant_at: req.user.premium_grant_next_at,
  });
}));

router.post('/premium/subscribe', volunteer, wrap((req, res) => {
  const result = premium.subscribe(req.user, req.body?.plan);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  premium.applyGrants(user);
  res.json({ ...result, state: premium.state(user) });
}));

router.get('/referral', volunteer, wrap((req, res) => {
  res.json(referrals.summary(req.user));
}));

// ── Safety ──

router.get('/safety/notice', volunteer, (req, res) => {
  res.json({ ...social.SAFETY_NOTICE, acknowledged_at: req.user.safety_notice_ack_at, categories: social.REPORT_CATEGORIES });
});

router.post('/safety/notice/ack', volunteer, (req, res) => {
  db.prepare('UPDATE users SET safety_notice_ack_at = COALESCE(safety_notice_ack_at, ?) WHERE id = ?').run(clock.isoNow(), req.user.id);
  res.json({ ok: true });
});

router.post('/safety/reports', volunteer, wrap((req, res) => {
  res.status(201).json(social.submitReport(req.user, req.body ?? {}));
}));

// ── Notifications & metrics ──

router.get('/notifications', volunteer, wrap((req, res) => {
  const items = db.prepare(`
    SELECT id, kind, title, body, ref_type, ref_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50
  `).all(req.user.id);
  res.json({ notifications: items });
}));

router.post('/notifications/read', volunteer, wrap((req, res) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(clock.isoNow(), req.user.id);
  res.json({ ok: true });
}));

router.get('/metrics/me', volunteer, wrap((req, res) => {
  res.json(metrics.userMetrics(req.user));
}));

// D10 badge-presentation surface (see recryption/badgeStore.js): serve the
// partner's badge only if the server-side verify() passes. Scoped to a
// pairing the caller belongs to (?pairing_id=), or their latest active one.
router.get('/matching/partner-badge', requireAuth, requireProfile, wrap(async (req, res) => {
  const self = req.user;
  const pairing = req.query.pairing_id
    ? lifecycle.getPairing(req.query.pairing_id)
    : db.prepare(`
      SELECT * FROM pairings WHERE status IN ('confirmed', 'proposed') AND (user_a_id = ? OR user_b_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(self.id, self.id);
  if (!pairing || (pairing.user_a_id !== self.id && pairing.user_b_id !== self.id)) {
    return res.status(404).json({ error: 'No confirmed pairing.' });
  }
  const partnerId = pairing.user_a_id === self.id ? pairing.user_b_id : pairing.user_a_id;
  const result = await services.verifiedBadgeFor(partnerId);
  res.json(result);
}));

module.exports = { router, wrap, bookingView };
