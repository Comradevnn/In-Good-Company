// Every tunable number the matching ranker uses, in one frozen object.
// These are this prototype's own, untuned starting values — not taken from
// the private matching spec, which defines the required behaviour (see
// README "Specs"), not these numbers. Each weight group sums to 1 so every
// score stays in 0..1 and two scores compare meaningfully.
const MATCHING_CONFIG = deepFreeze({
  version: 'igc-custom-1',

  // Person-to-person fit.
  pair: { interests: 0.43, age: 0.33, experience: 0.24 },
  // One person's fit to a shift.
  shiftFit: { cause: 0.58, travel: 0.42 },
  // How the two halves combine into a pairing's base quality.
  blend: { pair: 0.55, shift: 0.45 },

  interestsUnknown: 0.35, // either side listed no interests
  ageHalfGapYears: 9, // the age gap at which closeness has halved
  experienceSpanLog2: 4, // experience-level gap (log2 of attended shifts) that scores 0
  mentorMinShiftsInCause: 3, // attended shifts in the cause to count as experienced in it
  mentorValue: 0.95, // experience value for a newcomer + experienced pairing

  closeCredit: 0.65, // share of credit a close (adjacent) cause match earns
  orgNoneFactor: 0.85, // cause fit kept when the org's mission doesn't match at all
  travelSlope: 0.75, // travel fit lost going from 0 to the full radius
  travelUnknown: 0.55, // either location or the radius is unknown

  // Learned affinity from the user's own private personal-fit ratings.
  affinityPriorOrg: 2,
  affinityPriorCause: 3,
  affinityOrgShare: 0.55,
  affinityMaxBoost: 0.12,
  affinityMaxPenalty: 0.22,
  poorFitOrgMax: 2, // a personal-fit rating at or below this demotes the org's shifts

  // Reliability is a penalty only; no history means no penalty.
  lateCancelWeight: 0.45,
  noShowWeight: 1,
  riskPrior: 2,
  riskWeight: 0.35,
  newcomerProtection: 0.65, // habitual late canceller + someone with no attended shifts
  repeatFactor: 0.92, // previously paired, not a mutual buddy request

  // Fairness: waiting adds up to this much, and searches this close to
  // their deadline are served first.
  fairnessWeight: 0.28,
  urgentWithinHours: 30,
});

const GROUPS = ['pair', 'shiftFit', 'blend'];
const UNIT_KEYS = ['interestsUnknown', 'mentorValue', 'closeCredit', 'orgNoneFactor', 'travelSlope', 'travelUnknown',
  'affinityOrgShare', 'affinityMaxBoost', 'affinityMaxPenalty', 'riskWeight', 'newcomerProtection', 'repeatFactor', 'fairnessWeight'];
const POSITIVE_KEYS = ['ageHalfGapYears', 'experienceSpanLog2', 'mentorMinShiftsInCause', 'affinityPriorOrg', 'affinityPriorCause',
  'lateCancelWeight', 'noShowWeight', 'riskPrior'];

// Returns a list of human-readable problems; [] means the config is usable.
function validateConfig(cfg) {
  const problems = [];
  for (const group of GROUPS) {
    const values = Object.values(cfg[group] ?? {});
    if (values.length === 0 || values.some((v) => typeof v !== 'number' || v < 0)) problems.push(`${group}: weights must be non-negative numbers`);
    const sum = values.reduce((s, v) => s + v, 0);
    if (Math.abs(sum - 1) > 1e-9) problems.push(`${group}: weights sum to ${sum}, not 1`);
  }
  for (const key of UNIT_KEYS) {
    if (typeof cfg[key] !== 'number' || cfg[key] < 0 || cfg[key] > 1) problems.push(`${key}: must be within 0..1`);
  }
  for (const key of POSITIVE_KEYS) {
    if (typeof cfg[key] !== 'number' || !(cfg[key] > 0)) problems.push(`${key}: must be a positive number`);
  }
  if (typeof cfg.poorFitOrgMax !== 'number') problems.push('poorFitOrgMax: must be a number');
  if (typeof cfg.urgentWithinHours !== 'number' || cfg.urgentWithinHours < 0) problems.push('urgentWithinHours: must be >= 0');
  return problems;
}

// A new frozen config with some values replaced (tests only).
function withOverrides(partial) {
  const merged = JSON.parse(JSON.stringify(MATCHING_CONFIG));
  for (const [key, value] of Object.entries(partial)) {
    merged[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...merged[key], ...value } : value;
  }
  return deepFreeze(merged);
}

function deepFreeze(obj) {
  for (const value of Object.values(obj)) if (value && typeof value === 'object') deepFreeze(value);
  return Object.freeze(obj);
}

module.exports = { MATCHING_CONFIG, validateConfig, withOverrides };
