const { ADJACENCY_TABLE } = require('./adjacency');

// Matching engine — the pure, DB-free checks: who can be paired with whom
// (hard filters) and which shifts a user's causes qualify them for (the
// cause gate). The private matching spec defines the required behaviour
// (see README "Specs"). lib/matchingRunner.js applies these to real
// users/orgs/shifts and adds everything that needs the database: the monthly
// matched-shift cap, reliability pauses, one open request ("slot") per user,
// the live shift capacity counter, buddy requests and prior-pairing history.
// Soft ranking lives in score.js and assign.js beside this file.

const HARD_FILTER_REASONS = {
  UNDERAGE: 'underage',
  UNVERIFIED: 'unverified',
  GENDER_PREF_MISMATCH: 'gender_pref_mismatch',
  SAFETY_FLAG: 'safety_flag',
  SAME_USER: 'same_user',
};

// User-to-user hard filters: age 18+, both verified, mutual gender_pref
// compatibility, and no safety report in either direction (which overrides
// everything, buddy status included). No duplicate pairing is checked by the
// caller against the pairings table — this function is pure.
function hardFiltersPass(userA, userB) {
  const reasons = [];

  // Malformed input (the same person on both sides) is never a valid pair.
  if (userA.id != null && userA.id === userB.id) reasons.push(HARD_FILTER_REASONS.SAME_USER);
  if (userA.age == null || userB.age == null || userA.age < 18 || userB.age < 18) reasons.push(HARD_FILTER_REASONS.UNDERAGE);
  if (!userA.verified || !userB.verified) reasons.push(HARD_FILTER_REASONS.UNVERIFIED);

  const genderPrefOk =
    (userA.gender_pref !== 'same_gender_only' || userA.gender === userB.gender) &&
    (userB.gender_pref !== 'same_gender_only' || userB.gender === userA.gender);
  if (!genderPrefOk) reasons.push(HARD_FILTER_REASONS.GENDER_PREF_MISMATCH);

  const flaggedEachOther =
    safeParseArray(userA.flagged_users).includes(userB.id) ||
    safeParseArray(userB.flagged_users).includes(userA.id);
  if (flaggedEachOther) reasons.push(HARD_FILTER_REASONS.SAFETY_FLAG);

  return { pass: reasons.length === 0, reasons };
}

function safeParseArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// How a user's causes relate to a list of tags: 'exact' if any is listed,
// 'close' if one is only adjacent (ADJACENCY_TABLE), else 'none'. An exact
// match is never combined with a close one.
function tagMatchLevel(userTags, targetTags) {
  if (userTags.some((tag) => targetTags.includes(tag))) return 'exact';
  if (userTags.some((tag) => (ADJACENCY_TABLE[tag] || []).some((adj) => targetTags.includes(adj)))) return 'close';
  return 'none';
}

function causeMatchLevels(userCauseTags, shift) {
  const shiftLevel = tagMatchLevel(userCauseTags, shift.cause_tags);
  const orgLevel = tagMatchLevel(userCauseTags, shift.org.mission_tags);
  return { shiftLevel, orgLevel, closeMatchUsed: shiftLevel === 'close' || orgLevel === 'close' };
}

// The cause gate as a lookup on (shift level, org level). The shift itself
// has to carry the signal: an exact shift match always qualifies, a close
// one only with some support from the org's mission, and an org-only match
// never does.
const CAUSE_GATE = {
  exact: { exact: true, close: true, none: true },
  close: { exact: true, close: true, none: false },
  none: { exact: false, close: false, none: false },
};

function causeGatePasses(levels) {
  return Boolean(CAUSE_GATE[levels.shiftLevel]?.[levels.orgLevel]);
}

// Haversine distance in miles, for the travel_radius_miles check.
function haversineMiles(a, b) {
  const R = 3958.8; // Earth radius, miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// A user clears a given shift if: the cause gate passes, the org is
// verified, and — if the user has a saved lat/lng and a travel radius — the
// shift falls within it. Users who
// only entered a city (no lat/lng, see LocationScreen.js) skip the radius
// check rather than being blocked, since there's no geocoding to place them
// on a map at all — flagged as a real simplification, not a silent gap.
function passesShiftGate(user, shift) {
  const causeTags = safeParseArray(user.cause_tags);
  const alignment = causeMatchLevels(causeTags, shift);
  if (!causeGatePasses(alignment)) return { pass: false, alignment };
  if (!shift.org.verified) return { pass: false, alignment };

  if (user.location_lat != null && user.location_lng != null && user.travel_radius_miles != null) {
    if (!shift.location) return { pass: true, alignment };
    const distance = haversineMiles({ lat: user.location_lat, lng: user.location_lng }, shift.location);
    if (distance > user.travel_radius_miles) return { pass: false, alignment, distance };
  }

  return { pass: true, alignment };
}

module.exports = {
  HARD_FILTER_REASONS,
  hardFiltersPass,
  causeMatchLevels,
  causeGatePasses,
  tagMatchLevel,
  haversineMiles,
  passesShiftGate,
  safeParseArray,
};
