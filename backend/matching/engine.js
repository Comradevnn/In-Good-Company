const { ADJACENCY_TABLE } = require('./adjacency');

// Minimal matching engine — Step 1a (hard filters) and Step 1b (alignment
// scoring) from specs/in-good-company-matching-prompt.md, scoped for a demo.
//
// DELIBERATELY SKIPPED vs. the full spec (see backend/index.js's route for
// where each of these would plug in):
//   - Step 1a: monthly matched-shift cap (free/Premium tier limits) — no
//     Deeds/shift-booking system exists yet to count against.
//   - Step 1a: "one active pairing per slot" is simplified to "one active
//     pairing at all" — there's no real multi-slot booking system, just a
//     single demo pairing concept (see backend/db/schema.sql's pairings
//     table comment).
//   - Step 2: capacity bookkeeping (shift capacity_remaining, decrementing
//     within a batch) — demo shifts have no capacity concept.
//   - Step 3: full soft ranking (interest overlap, age-band proximity,
//     geographic proximity, reliability reweighting, newcomer-veteran
//     override) — this build takes the first hard-filter-and-alignment-
//     passing candidate, not the best-ranked one.
//   - Step 4: tie-break, buddy handling — no ranking means no ties to
//     break, and buddy status isn't modeled at all yet.
//   - "verified profile data, not stated age alone" (spec's exact M1
//     nuance) — there's only one age field in this schema, so this build
//     just uses it directly.

const HARD_FILTER_REASONS = {
  UNDERAGE: 'underage',
  UNVERIFIED: 'unverified',
  GENDER_PREF_MISMATCH: 'gender_pref_mismatch',
  SAFETY_FLAG: 'safety_flag',
};

// Step 1a. Named filters per this build's scope: age 18+, both verified,
// mutual gender_pref compatibility, no duplicate pairing (checked by the
// caller against the pairings table, not here — this function is pure and
// has no DB access). The safety-flag block is included too, beyond the
// four explicitly scoped, because the data already exists on the user rows
// and it's the one hard filter the spec calls out as overriding every other
// rule — skipping a safety check to save a few lines felt like the wrong
// place to cut scope.
function hardFiltersPass(userA, userB) {
  const reasons = [];

  if (userA.age < 18 || userB.age < 18) reasons.push(HARD_FILTER_REASONS.UNDERAGE);
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

// Step 1b. shift_tag_alignment / org_mission_alignment / weighted score,
// exactly as specced (0.6/0.4 weights, "higher of exact-vs-close wins" per
// point 8, threshold >= 0.5).
function computeAlignment(userCauseTags, shift) {
  const shiftAlignment = tagAlignment(userCauseTags, shift.cause_tags);
  const orgAlignment = tagAlignment(userCauseTags, shift.org.mission_tags);
  const score = 0.6 * shiftAlignment.value + 0.4 * orgAlignment.value;
  return {
    score,
    shiftAlignment: shiftAlignment.value,
    orgAlignment: orgAlignment.value,
    closeMatchUsed: shiftAlignment.usedClose || orgAlignment.usedClose,
  };
}

function tagAlignment(userTags, targetTags) {
  const exact = userTags.some((tag) => targetTags.includes(tag));
  if (exact) return { value: 1.0, usedClose: false };
  const close = userTags.some((tag) => (ADJACENCY_TABLE[tag] || []).some((adj) => targetTags.includes(adj)));
  return { value: close ? 0.5 : 0.0, usedClose: close };
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

// A user clears a given demo shift if: alignment score >= 0.5, the org is
// verified (trivially true for all demo shifts), and — if the user has a
// saved lat/lng and a travel radius — the shift falls within it. Users who
// only entered a city (no lat/lng, see LocationScreen.js) skip the radius
// check rather than being blocked, since there's no geocoding to place them
// on a map at all — flagged as a real simplification, not a silent gap.
function passesShiftGate(user, shift) {
  const causeTags = safeParseArray(user.cause_tags);
  const alignment = computeAlignment(causeTags, shift);
  if (alignment.score < 0.5) return { pass: false, alignment };
  if (!shift.org.verified) return { pass: false, alignment };

  if (user.location_lat != null && user.location_lng != null && user.travel_radius_miles != null) {
    const distance = haversineMiles({ lat: user.location_lat, lng: user.location_lng }, shift.location);
    if (distance > user.travel_radius_miles) return { pass: false, alignment, distance };
  }

  return { pass: true, alignment };
}

module.exports = {
  HARD_FILTER_REASONS,
  hardFiltersPass,
  computeAlignment,
  haversineMiles,
  passesShiftGate,
  safeParseArray,
};
