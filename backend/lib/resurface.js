// Resurfacing nudges: a quiet volunteer is told, at most once per cadence
// period, that open shifts fitting their causes and distance are coming up.
// The cadence comes from the volunteering frequency chosen at onboarding.
// This is notifications only — it never feeds matching or ranking, and the
// nudge names no other user.
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const { notify } = require('./notify');
const { visibleShifts } = require('./shifts');
const { eligibilityBlock } = require('./matchingRunner');
const { haversineMiles, causeMatchLevels, causeGatePasses, safeParseArray } = require('../matching/engine');

const KIND = 'resurface';

// One pass over verified users who have a frequency; the last activity and
// the "busy" facts come from correlated subqueries so the per-user work in
// JS is only comparisons.
const CANDIDATES_SQL = `
  SELECT u.*,
    (SELECT MAX(s.ends_at) FROM bookings b JOIN shifts s ON s.id = b.shift_id
      WHERE b.user_id = u.id AND b.status IN ('attended', 'unverified')) AS last_shift_end,
    (SELECT MAX(r.ended_at) FROM availability_requests r WHERE r.user_id = u.id) AS last_search_end,
    (SELECT MAX(n.created_at) FROM notifications n WHERE n.user_id = u.id AND n.kind = '${KIND}') AS last_nudge,
    EXISTS (SELECT 1 FROM availability_requests r WHERE r.user_id = u.id AND r.status IN ('searching', 'proposed')) AS has_open_search,
    EXISTS (SELECT 1 FROM bookings b JOIN shifts s ON s.id = b.shift_id
      WHERE b.user_id = u.id AND b.status IN ('proposed', 'confirmed') AND s.ends_at > @now) AS has_upcoming_booking
  FROM users u
  WHERE u.verified = 1 AND u.volunteering_frequency IS NOT NULL
`;

function lastActivityMs(row) {
  // A user with no history yet is measured from when they joined.
  const times = [row.last_shift_end, row.last_search_end, row.last_nudge, row.created_at]
    .map((value) => clock.parseTime(value)).filter((ms) => ms != null && !Number.isNaN(ms));
  return times.length ? Math.max(...times) : null;
}

function fits(user, causes, shift) {
  if (!causeGatePasses(causeMatchLevels(causes, shift))) return false;
  if (user.location_lat == null || user.travel_radius_miles == null || !shift.location) return true;
  return haversineMiles({ lat: user.location_lat, lng: user.location_lng }, shift.location) <= user.travel_radius_miles;
}

function runResurfacing(nowMs = clock.nowMs()) {
  const nowIso = new Date(nowMs).toISOString();
  const candidates = db.prepare(CANDIDATES_SQL).all({ now: nowIso });
  let upcoming = null; // loaded once, and only if someone is actually due
  let nudged = 0;

  for (const user of candidates) {
    const cadenceDays = rules.RESURFACE_CADENCE_DAYS[user.volunteering_frequency];
    if (cadenceDays == null || user.has_open_search || user.has_upcoming_booking) continue;
    const last = lastActivityMs(user);
    if (last == null || nowMs - last < cadenceDays * clock.DAY) continue;
    if (eligibilityBlock(user, { kind: 'standard' }, nowMs)) continue;

    if (upcoming === null) {
      const horizon = nowMs + rules.RESURFACE_HORIZON_MS;
      upcoming = visibleShifts(new Date(nowMs + rules.MIN_LEAD_MS).toISOString())
        .filter((shift) => shift.capacity_remaining >= 1 && Date.parse(shift.starts_at) <= horizon);
    }
    const causes = safeParseArray(user.cause_tags);
    const count = upcoming.filter((shift) => fits(user, causes, shift)).length;
    if (count === 0) continue;

    notify(user.id, KIND, 'New shifts that fit you',
      `${count} open ${count === 1 ? 'shift' : 'shifts'} in the next two weeks fit your causes and distance. Tap to find a match.`,
      { type: 'matching' });
    nudged++;
  }
  return nudged;
}

module.exports = { runResurfacing };
