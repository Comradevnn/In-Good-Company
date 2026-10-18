// Partner-facing views, post-shift ratings, the buddy system and safety
// reports. Visibility rules live here:
//   - partner card: the brief, user-controlled summary only (no full history,
//     no past org names, no reliability signal, no contact details);
//   - an org's operational rating is public (aggregated on its profile);
//     a volunteer's personal-fit rating is private to that volunteer;
//   - the org's rating of a volunteer is visible to that volunteer, and on
//     their public history only if they choose;
//   - "would volunteer again" answers are never shown to the other person —
//     a buddy forms only when both said yes, otherwise nobody learns anything.
const db = require('../db');
const clock = require('./clock');
const premium = require('./premium');
const { notify } = require('./notify');
const { getShift } = require('./shifts');
const { safeParseArray } = require('../matching/engine');
const { LifecycleError, getBooking, getPairing, getUser, cancelBooking } = require('./lifecycle');

const RATING_LABELS = { 1: 'bad', 2: 'leaning bad', 3: 'neutral', 4: 'leaning good', 5: 'good' };

function completedShiftCount(userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND status = 'attended'").get(userId).n;
}

// Brief partner profile (shown on proposals, pairings and chat headers).
function partnerCard(userId) {
  const user = getUser(userId);
  const publicRatings = db.prepare(`
    SELECT r.attendance, r.contribution, s.cause_tags FROM org_volunteer_ratings r
    JOIN bookings b ON b.id = r.booking_id JOIN shifts s ON s.id = b.shift_id
    WHERE r.user_id = ? AND b.org_rating_public = 1
  `).all(userId);
  return {
    user_id: user.id,
    display_name: user.display_name,
    age: user.age,
    gender: user.gender,
    occupation: user.occupation,
    bio: user.bio,
    causes: safeParseArray(user.cause_tags),
    history: {
      shift_count: completedShiftCount(userId),
      causes_volunteered: safeParseArray(user.cause_tags_experienced),
      // Only ratings the user chose to make public, and only at cause level.
      public_org_ratings: publicRatings.map((r) => ({
        cause_tags: safeParseArray(r.cause_tags),
        attendance: RATING_LABELS[r.attendance],
        contribution: RATING_LABELS[r.contribution],
      })),
    },
    verified: Boolean(user.verified),
  };
}

function ratingScale(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new LifecycleError('invalid_rating', `${field} must be 1-5.`, 400);
  return n;
}

// ── Volunteer rates the org (two axes) and their partner ──

function ratingForm(user, bookingId) {
  const booking = getBooking(bookingId);
  if (!booking || booking.user_id !== user.id) throw new LifecycleError('not_found', 'Booking not found.', 404);
  const shift = getShift(booking.shift_id);
  const pairingId = booking.pairing_id ?? db.prepare(`
    SELECT id FROM pairings WHERE status IN ('completed', 'confirmed') AND (booking_a_id = ? OR booking_b_id = ?)
  `).get(booking.id, booking.id)?.id;
  const pairing = pairingId ? getPairing(pairingId) : null;
  const partnerId = pairing ? (pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id) : null;
  const orgRating = db.prepare('SELECT attendance, contribution FROM org_volunteer_ratings WHERE booking_id = ?').get(booking.id);
  return {
    booking_id: booking.id,
    status: booking.status,
    can_rate: ['attended', 'unverified'].includes(booking.status) && Date.parse(shift.ends_at) <= clock.nowMs(),
    shift: { title: shift.title, org_name: shift.org.name, when_label: shift.when_label, cause_tags: shift.cause_tags },
    hours: Math.round(((Date.parse(shift.ends_at) - Date.parse(shift.starts_at)) / clock.HOUR) * 10) / 10,
    partner: partnerId ? { user_id: partnerId, display_name: getUser(partnerId).display_name } : null,
    org_rated: Boolean(db.prepare('SELECT 1 FROM volunteer_org_ratings WHERE booking_id = ?').get(booking.id)),
    partner_rated: pairing ? Boolean(db.prepare('SELECT 1 FROM partner_ratings WHERE pairing_id = ? AND rater_user_id = ?').get(pairing.id, user.id)) : false,
    // The org's rating of this volunteer: visible to them, public only by choice.
    org_rating_of_you: orgRating ? { attendance: RATING_LABELS[orgRating.attendance], contribution: RATING_LABELS[orgRating.contribution] } : null,
    org_rating_public: Boolean(booking.org_rating_public),
    buddy_slots: buddySlots(user),
  };
}

const submitRatings = db.transaction((user, bookingId, body) => {
  const form = ratingForm(user, bookingId);
  if (!form.can_rate) throw new LifecycleError('not_rateable', 'You can rate a shift once it is done.');
  const booking = getBooking(bookingId);
  const shift = getShift(booking.shift_id);
  const now = clock.isoNow();

  if (body.org_operational != null || body.personal_fit != null) {
    if (form.org_rated) throw new LifecycleError('already_rated', 'You already rated this shift.');
    db.prepare(`
      INSERT INTO volunteer_org_ratings (booking_id, user_id, org_id, shift_id, operational, personal_fit, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(booking.id, user.id, shift.org_id, shift.id, ratingScale(body.org_operational, 'org_operational'),
      ratingScale(body.personal_fit, 'personal_fit'), now);
  }

  let buddy = null;
  if (body.volunteer_again != null) {
    if (!form.partner) throw new LifecycleError('no_partner', 'There is no partner to rate for this shift.');
    if (form.partner_rated) throw new LifecycleError('already_rated', 'You already rated your partner.');
    const pairingId = booking.pairing_id ?? db.prepare(`
      SELECT id FROM pairings WHERE (booking_a_id = ? OR booking_b_id = ?) AND status IN ('completed', 'confirmed')
    `).get(booking.id, booking.id).id;
    db.prepare(`
      INSERT INTO partner_ratings (pairing_id, rater_user_id, ratee_user_id, showed_up, volunteer_again, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(pairingId, user.id, form.partner.user_id, body.partner_showed_up === false ? 0 : 1, body.volunteer_again ? 1 : 0, now);
    buddy = maybeFormBuddy(pairingId);
  }
  // Deliberately not returned: whether the partner said yes. `buddy` is only
  // non-null when both did and the buddyship formed.
  return { ok: true, became_buddies: Boolean(buddy) };
});

function setOrgRatingVisibility(user, bookingId, isPublic) {
  const booking = getBooking(bookingId);
  if (!booking || booking.user_id !== user.id) throw new LifecycleError('not_found', 'Booking not found.', 404);
  db.prepare('UPDATE bookings SET org_rating_public = ? WHERE id = ?').run(isPublic ? 1 : 0, booking.id);
}

// ── Buddies ──

function activeBuddyCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM buddies WHERE status = 'active' AND (user_low_id = ? OR user_high_id = ?)
  `).get(userId, userId).n;
}

function buddySlots(user) {
  const cap = premium.state(user).buddy_cap;
  const used = activeBuddyCount(user.id);
  return { cap, used, full: used >= cap };
}

function maybeFormBuddy(pairingId) {
  const answers = db.prepare('SELECT * FROM partner_ratings WHERE pairing_id = ?').all(pairingId);
  if (answers.length < 2 || !answers.every((a) => a.volunteer_again === 1)) return null;
  const pairing = getPairing(pairingId);
  const [low, high] = [pairing.user_a_id, pairing.user_b_id].sort();
  if (db.prepare("SELECT 1 FROM buddies WHERE status = 'active' AND user_low_id = ? AND user_high_id = ?").get(low, high)) return null;
  const userA = getUser(low);
  const userB = getUser(high);
  // Both at or under their own plan's buddy cap; otherwise nothing forms and
  // nobody is told why (indistinguishable from a "no").
  if (buddySlots(userA).full || buddySlots(userB).full) return null;
  db.prepare(`
    INSERT INTO buddies (user_low_id, user_high_id, status, source_pairing_id, created_at) VALUES (?, ?, 'active', ?, ?)
  `).run(low, high, pairingId, clock.isoNow());
  for (const [me, other] of [[userA, userB], [userB, userA]]) {
    notify(me.id, 'buddy_formed', `You and ${other.display_name} are volunteer buddies`,
      'You both said you would volunteer together again. Next time you look for a shift, you can choose to go together.');
  }
  return true;
}

function listBuddies(user) {
  return db.prepare(`
    SELECT * FROM buddies WHERE status = 'active' AND (user_low_id = ? OR user_high_id = ?) ORDER BY created_at
  `).all(user.id, user.id).map((b) => {
    const otherId = b.user_low_id === user.id ? b.user_high_id : b.user_low_id;
    const other = getUser(otherId);
    const together = db.prepare(`
      SELECT COUNT(*) AS n FROM pairings WHERE status = 'completed'
        AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
    `).get(user.id, otherId, otherId, user.id).n;
    return { buddy_id: b.id, user_id: otherId, display_name: other.display_name, since: b.created_at, shifts_together: together };
  });
}

// Either buddy can end it quietly; the other isn't notified.
function endBuddy(user, buddyId) {
  const row = db.prepare('SELECT * FROM buddies WHERE id = ?').get(buddyId);
  if (!row || (row.user_low_id !== user.id && row.user_high_id !== user.id) || row.status !== 'active') {
    throw new LifecycleError('not_found', 'Buddy not found.', 404);
  }
  db.prepare("UPDATE buddies SET status = 'ended', ended_at = ? WHERE id = ?").run(clock.isoNow(), buddyId);
}

// ── Safety ──

const REPORT_CATEGORIES = ['made_me_uncomfortable', 'inappropriate_messages', 'no_show_or_unreliable', 'safety_concern', 'other'];

const SAFETY_NOTICE = {
  title: 'Before your first shift',
  points: [
    "You'll always meet at the org's own site, with their staff around — shifts are never at someone's home.",
    'Where we can, we point out shifts that happen in daylight.',
    'Your phone number, email and socials stay hidden until you both switch on contact sharing in chat.',
    'Tap "Share my plans" to send someone you trust the time, the place and your partner\'s verified first name.',
    'If anything feels off, report it from the app — a real person reads every report.',
    "A verified badge means we've checked who someone is. It doesn't vouch for anything else, so go with your gut and lean on the org's staff.",
  ],
};

const fileReport = db.transaction((user, body) => {
  const category = REPORT_CATEGORIES.includes(body.category) ? body.category : null;
  if (!category) throw new LifecycleError('invalid_category', `category must be one of: ${REPORT_CATEGORIES.join(', ')}`, 400);
  let reportedId = body.reported_user_id ?? null;
  let pairing = null;
  if (body.pairing_id) {
    pairing = getPairing(body.pairing_id);
    if (!pairing || (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id)) throw new LifecycleError('not_found', 'Pairing not found.', 404);
    reportedId = pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id;
  }
  if (reportedId && !getUser(reportedId)) throw new LifecycleError('not_found', 'User not found.', 404);
  const reportId = require('node:crypto').randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO safety_reports (id, reporter_user_id, reported_user_id, pairing_id, category, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(reportId, user.id, reportedId, pairing?.id ?? null, category, String(body.description ?? '').slice(0, 2000), clock.isoNow());

  // A report permanently blocks the two from being paired again, whatever
  // else is true (buddies included).
  if (reportedId) {
    const addTo = (userId, column, value) => {
      const row = getUser(userId);
      const list = safeParseArray(row[column]);
      if (!list.includes(value)) list.push(value);
      db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(JSON.stringify(list), userId);
    };
    addTo(user.id, 'flagged_users', reportedId);
    addTo(reportedId, 'flagged_by', user.id);
    db.prepare(`
      UPDATE buddies SET status = 'ended', ended_at = ? WHERE status = 'active'
        AND ((user_low_id = ? AND user_high_id = ?) OR (user_low_id = ? AND user_high_id = ?))
    `).run(clock.isoNow(), user.id, reportedId, reportedId, user.id);
  }
  notify(user.id, 'report_received', 'We got your report', 'A person on our team will review it. Thank you for telling us.');
  return { report_id: reportId, reported_user_id: reportedId, pairing };
});

// Reporting a partner can also take the reporter out of the pairing, at no
// Deeds or reliability cost. The partner is told only that they can't make it.
function submitReport(user, body) {
  const { report_id, pairing } = fileReport(user, body);
  let cancelled = false;
  if (body.cancel_pairing && pairing && ['confirmed', 'proposed'].includes(pairing.status)) {
    const side = pairing.user_a_id === user.id ? 'a' : 'b';
    const booking = getBooking(pairing[`booking_${side}_id`]);
    if (booking?.status === 'confirmed') {
      cancelSafely(user, booking);
      cancelled = true;
    } else if (pairing.status === 'proposed') {
      require('./lifecycle').submitDecline(user, pairing.id, { keepLooking: true });
      cancelled = true;
    }
  }
  return { report_id, cancelled };
}

function cancelSafely(user, booking) {
  cancelBooking(user, booking.id, { reason: 'safety' });
}

// Payload for "share my plans": plain text the app hands to the system
// share sheet, so it works for any recipient — no account needed.
function sharePlan(user, pairingId) {
  const pairing = getPairing(pairingId);
  if (!pairing || (pairing.user_a_id !== user.id && pairing.user_b_id !== user.id)) throw new LifecycleError('not_found', 'Pairing not found.', 404);
  const shift = getShift(pairing.shift_id);
  const partner = partnerCard(pairing.user_a_id === user.id ? pairing.user_b_id : pairing.user_a_id);
  const lines = [
    `My volunteer plans (via In Good Company):`,
    `${shift.title} at ${shift.org.name}`,
    `When: ${shift.when_label}`,
    `Where: ${shift.location_label ?? 'see the org'}`,
    `Going with: ${partner.display_name}${partner.age ? `, ${partner.age}` : ''}${partner.verified ? ' (ID-verified)' : ''}`,
    `It's a supervised shift at a verified nonprofit.`,
  ];
  return {
    message: lines.join('\n'),
    shift: { title: shift.title, org_name: shift.org.name, when_label: shift.when_label, location_label: shift.location_label },
    partner: { display_name: partner.display_name, verified: partner.verified },
  };
}

module.exports = {
  RATING_LABELS,
  partnerCard,
  ratingForm,
  submitRatings,
  setOrgRatingVisibility,
  buddySlots,
  listBuddies,
  endBuddy,
  REPORT_CATEGORIES,
  SAFETY_NOTICE,
  submitReport,
  sharePlan,
  completedShiftCount,
};
