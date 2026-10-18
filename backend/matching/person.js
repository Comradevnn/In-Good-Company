// Turns raw DB rows into the plain "person" object the ranker works on.
// Deliberately copies only what matching may use: Premium tier, the
// friendship/romance preference (seeking), volunteering frequency and every
// free-text field are left out, so they cannot influence a score. Pure.
const { safeParseArray } = require('./engine');
const { learnAffinity } = require('./affinity');
const { orgStanding } = require('./score');

function normaliseInterest(tag) {
  return String(tag).toLowerCase().trim().replace(/\s+/g, ' ');
}

// stats: { attendedShifts, attendedByCause, reliability: { attended, late, noShow },
//          ratings: [{ orgId, personalFit, causeTags }] (this user's own ratings of orgs),
//          orgRatings: [{ attendance, contribution }] (orgs' ratings of this user),
//          eligibleShiftIds, anchorShiftId }
function toMatchPerson(userRow, requestRow, stats, cfg) {
  const ratings = stats.ratings ?? [];
  const parseMs = (iso) => (iso ? Date.parse(iso) : NaN);
  return {
    requestId: requestRow.id,
    userId: userRow.id,
    kind: requestRow.kind,
    createdAtMs: parseMs(requestRow.created_at),
    deadlineMs: parseMs(requestRow.search_deadline),
    buddyUserId: requestRow.buddy_user_id ?? null,
    matchPreference: requestRow.match_preference === 'anyone' ? 'anyone' : 'best',
    anchorShiftId: stats.anchorShiftId ?? null,

    age: userRow.age ?? null,
    gender: userRow.gender ?? null,
    genderPref: userRow.gender_pref ?? null,
    verified: Boolean(userRow.verified),
    flaggedUsers: safeParseArray(userRow.flagged_users),
    causes: safeParseArray(userRow.cause_tags),
    interests: [...new Set(safeParseArray(userRow.interest_tags).map(normaliseInterest).filter(Boolean))],
    home: userRow.location_lat != null && userRow.location_lng != null ? { lat: userRow.location_lat, lng: userRow.location_lng } : null,
    radiusMiles: requestRow.travel_radius_miles ?? userRow.travel_radius_miles ?? null,
    ageMin: requestRow.age_min ?? null,
    ageMax: requestRow.age_max ?? null,

    standing: orgStanding(stats.orgRatings, cfg),
    attendedShifts: stats.attendedShifts ?? 0,
    attendedByCause: { ...(stats.attendedByCause ?? {}) },
    reliability: {
      attended: stats.reliability?.attended ?? 0,
      late: stats.reliability?.late ?? 0,
      noShow: stats.reliability?.noShow ?? 0,
      habitualLate: Boolean(userRow.reliability_flag_habitual_late_canceller),
    },
    affinity: learnAffinity(ratings, cfg),
    poorFitOrgIds: [...new Set(ratings.filter((r) => r.personalFit <= cfg.poorFitOrgMax).map((r) => r.orgId))],
    eligibleShiftIds: [...(stats.eligibleShiftIds ?? [])],
  };
}

module.exports = { toMatchPerson, normaliseInterest };
