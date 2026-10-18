// Onboarding is still manual screen-swapping (no navigation library) — see
// App.js. Both paths through "orgOrCause" end with cause tags, since
// matching needs them: naming an org (captured as a lead) is followed by
// picking the causes closest to it. Identity verification is not part of
// this flow — it hangs off the home screen.
export const CAUSE_FLOW = ['quickProfile', 'location', 'orgOrCause', 'causes', 'partnerPrefs', 'availability', 'done'];
export const ORG_FLOW = ['quickProfile', 'location', 'orgOrCause', 'causes', 'partnerPrefs', 'availability', 'done'];

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Given the full profile row from GET /users/me (or null if none exists
// yet), figures out which flow applies and which step to resume at — the
// first step whose required fields aren't filled in yet. Each check reads
// only real signals actually written by that step's PATCH/POST, not fields
// that ship with usable defaults (see partner_prefs_confirmed's comment in
// backend/db/schema.sql for why that one needs its own flag).
export function determineResumeStep(profile) {
  if (!profile) {
    return { flow: CAUSE_FLOW, stepIndex: 0 };
  }

  const causeTags = parseJsonArray(profile.cause_tags);
  const hasOrgLead = Boolean(profile.prospective_org_name);
  const hasCauses = causeTags.length >= 2;
  const flow = hasOrgLead ? ORG_FLOW : CAUSE_FLOW;

  const locationDone = Boolean(profile.location_city) ||
    (profile.location_lat != null && profile.location_lng != null);
  const orgOrCauseDone = hasOrgLead || hasCauses;
  const partnerPrefsDone = Boolean(profile.partner_prefs_confirmed);
  const availabilityDone = Boolean(profile.availability_window_start) &&
    Boolean(profile.availability_window_end);

  // quickProfile itself is always done once a profile row exists at all —
  // full_name/age/gender are NOT NULL, so the row can't exist without them.
  if (!locationDone) return { flow, stepIndex: flow.indexOf('location') };
  if (!orgOrCauseDone) return { flow, stepIndex: flow.indexOf('orgOrCause') };
  // An org lead alone isn't enough to match on — the causes step follows.
  if (!hasCauses) return { flow, stepIndex: flow.indexOf('causes') };
  if (!partnerPrefsDone) return { flow, stepIndex: flow.indexOf('partnerPrefs') };
  if (!availabilityDone) return { flow, stepIndex: flow.indexOf('availability') };
  return { flow, stepIndex: flow.indexOf('done') };
}
