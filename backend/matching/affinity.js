// A small, bounded adjustment learned from one user's own private
// "personal fit" ratings (the axis that only tunes their own matching). It
// only ever feeds that user's own shift fit, so nobody's ratings change how
// anyone else is matched. Pure: no database.

// ratings: [{ orgId, personalFit (1..5), causeTags: [...] }]
// → { org: { [orgId]: v }, cause: { [tag]: v } }, each v strictly inside -1..1.
// Values shrink toward 0, so one rating nudges and many ratings move further.
function learnAffinity(ratings, cfg) {
  const orgSum = {};
  const orgN = {};
  const causeSum = {};
  const causeN = {};
  for (const r of ratings ?? []) {
    const fit = Number(r.personalFit);
    if (!Number.isFinite(fit)) continue;
    const c = Math.max(-1, Math.min(1, (fit - 3) / 2));
    if (r.orgId != null) {
      orgSum[r.orgId] = (orgSum[r.orgId] ?? 0) + c;
      orgN[r.orgId] = (orgN[r.orgId] ?? 0) + 1;
    }
    for (const tag of new Set(r.causeTags ?? [])) {
      causeSum[tag] = (causeSum[tag] ?? 0) + c;
      causeN[tag] = (causeN[tag] ?? 0) + 1;
    }
  }
  const org = {};
  for (const id of Object.keys(orgSum)) org[id] = orgSum[id] / (orgN[id] + cfg.affinityPriorOrg);
  const cause = {};
  for (const tag of Object.keys(causeSum)) cause[tag] = causeSum[tag] / (causeN[tag] + cfg.affinityPriorCause);
  return { org, cause };
}

// The adjustment for one shift, within -affinityMaxPenalty..+affinityMaxBoost
// (a dislike is allowed to count for more than a like). 0 with no ratings.
function shiftAffinity(affinity, shift, cfg) {
  if (!affinity) return 0;
  const orgValue = affinity.org?.[shift.org_id] ?? 0;
  const tagValues = (shift.cause_tags ?? []).map((t) => affinity.cause?.[t]).filter((v) => v != null);
  const causeValue = tagValues.length ? tagValues.reduce((s, v) => s + v, 0) / tagValues.length : 0;
  const raw = cfg.affinityOrgShare * orgValue + (1 - cfg.affinityOrgShare) * causeValue;
  if (raw === 0) return 0;
  return raw > 0 ? raw * cfg.affinityMaxBoost : raw * cfg.affinityMaxPenalty;
}

module.exports = { learnAffinity, shiftAffinity };
