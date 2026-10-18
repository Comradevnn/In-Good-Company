// Soft ranking for one candidate pairing: two people and a shift they both
// already qualify for (hard filters and the cause gate are applied first and
// can never be outweighed by anything here). Every component is in 0..1,
// weights come from config.js, penalties are multipliers, and the result is
// symmetric in the two people. Pure: no database, no clock, no randomness.
const { haversineMiles, tagMatchLevel } = require('./engine');
const { ADJACENCY_TABLE } = require('./adjacency');
const { shiftAffinity } = require('./affinity');

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ── Person-to-person ──

// Set cosine of the two interest lists (already normalised by person.js).
function interestOverlap(aTags, bTags, cfg) {
  const a = new Set(aTags ?? []);
  const b = new Set(bTags ?? []);
  if (a.size === 0 || b.size === 0) return cfg.interestsUnknown;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

function ageCloseness(ageA, ageB, cfg) {
  if (ageA == null || ageB == null) return cfg.interestsUnknown;
  const ratio = Math.abs(ageA - ageB) / cfg.ageHalfGapYears;
  return 1 / (1 + ratio * ratio);
}

// Attended shifts carrying any of this shift's causes. Per-tag counts can
// double-count a multi-tag shift, so "experienced" uses the largest single
// tag count (a lower bound) and "newcomer" means every count is zero.
function causeExperience(person, shift) {
  const counts = (shift.cause_tags ?? []).map((t) => person.attendedByCause?.[t] ?? 0);
  return counts.length ? Math.max(...counts) : 0;
}

// Peers at any level score high; a newcomer to this shift's cause with
// someone experienced in it gets the mentor mix instead.
function experienceFit(a, b, shift, cfg) {
  const ea = causeExperience(a, shift);
  const eb = causeExperience(b, shift);
  const mentor = (ea === 0 && eb >= cfg.mentorMinShiftsInCause) || (eb === 0 && ea >= cfg.mentorMinShiftsInCause);
  if (mentor) return { value: cfg.mentorValue, mentor: true };
  const la = Math.log2(1 + (a.attendedShifts ?? 0));
  const lb = Math.log2(1 + (b.attendedShifts ?? 0));
  return { value: Math.max(0, 1 - Math.abs(la - lb) / cfg.experienceSpanLog2), mentor: false };
}

// How orgs have rated this person (attendance and contribution), 0..1,
// shrunk toward neutral; someone nobody has rated yet is exactly neutral.
function orgStanding(orgRatings, cfg) {
  let sum = 0;
  let n = 0;
  for (const r of orgRatings ?? []) {
    const a = Number(r.attendance);
    const c = Number(r.contribution);
    if (!Number.isFinite(a) || !Number.isFinite(c)) continue;
    sum += clamp01(((a + c) / 2 - 1) / 4);
    n++;
  }
  return (sum + cfg.standingPrior * cfg.standingNeutral) / (n + cfg.standingPrior);
}

// Geometric mean: two highly rated volunteers together score highest.
function standingFit(a, b) {
  return Math.sqrt(a * b);
}

// How well run volunteers rate an org (the public operational axis), 0..1,
// shrunk toward neutral the same way. stats: { sum, n } of raw 1..5 ratings.
function orgQuality(stats, cfg) {
  const n = stats?.n ?? 0;
  const sum = n ? (stats.sum - n) / 4 : 0;
  return (sum + cfg.orgQualityPrior * cfg.orgQualityNeutral) / (n + cfg.orgQualityPrior);
}

// ── One person's fit to a shift ──

// How much of the shift's cause list this person covers (adjacent causes
// earn partial credit), reduced when the org's mission doesn't match at all.
function causeFit(person, shift, cfg) {
  const tags = shift.cause_tags ?? [];
  if (tags.length === 0) return 0;
  const mine = person.causes ?? [];
  let credit = 0;
  for (const t of tags) {
    if (mine.includes(t)) credit += 1;
    else if (mine.some((c) => (ADJACENCY_TABLE[c] || []).includes(t))) credit += cfg.closeCredit;
  }
  let value = clamp01(credit / tags.length);
  if (tagMatchLevel(mine, shift.org?.mission_tags ?? []) === 'none') value *= cfg.orgNoneFactor;
  return value;
}

// Travel to the shift relative to this person's own radius (not the
// distance between the two volunteers' homes).
function travelFit(person, shift, cfg) {
  if (!person.home || !shift.location || !(person.radiusMiles > 0)) return cfg.travelUnknown;
  const miles = haversineMiles(person.home, shift.location);
  return clamp01(1 - cfg.travelSlope * (miles / person.radiusMiles));
}

// The cause/travel part is scaled to leave headroom for the learned
// boost, so a liked org still counts on a shift that already fits perfectly.
function shiftFitFor(person, shift, cfg) {
  const cause = causeFit(person, shift, cfg);
  const travel = travelFit(person, shift, cfg);
  const affinity = shiftAffinity(person.affinity, shift, cfg);
  const org = shift.org_quality ?? cfg.orgQualityNeutral;
  const fit = cfg.shiftFit.cause * cause + cfg.shiftFit.travel * travel + cfg.shiftFit.org * org;
  return { cause, travel, org, affinity, value: clamp01((1 - cfg.affinityMaxBoost) * fit + affinity) };
}

// ── Multipliers ──

function reliabilityRisk(person, cfg) {
  const r = person.reliability ?? {};
  const late = r.late ?? 0;
  const noShow = r.noShow ?? 0;
  const total = (r.attended ?? 0) + late + noShow;
  return (cfg.lateCancelWeight * late + cfg.noShowWeight * noShow) / (total + cfg.riskPrior);
}

// facts: { repeat: boolean, mutualBuddy: boolean }
function scoreTriple(a, b, shift, facts, cfg) {
  // Canonical order, so the score is bit-for-bit the same either way round.
  const [x, y] = String(a.userId) <= String(b.userId) ? [a, b] : [b, a];

  const interests = interestOverlap(x.interests, y.interests, cfg);
  const age = ageCloseness(x.age, y.age, cfg);
  const experience = experienceFit(x, y, shift, cfg);
  const standing = standingFit(x.standing ?? cfg.standingNeutral, y.standing ?? cfg.standingNeutral);
  const pairFit = cfg.pair.interests * interests + cfg.pair.age * age + cfg.pair.experience * experience.value
    + cfg.pair.standing * standing;

  const fx = shiftFitFor(x, shift, cfg);
  const fy = shiftFitFor(y, shift, cfg);
  const pairShiftFit = Math.sqrt(fx.value * fy.value);

  const base = cfg.blend.pair * pairFit + cfg.blend.shift * pairShiftFit;

  const flags = [];
  if (experience.mentor) flags.push('mentor_mix');
  const reliability = 1 - cfg.riskWeight * Math.max(reliabilityRisk(x, cfg), reliabilityRisk(y, cfg));
  const newcomerRisk = ((x.attendedShifts ?? 0) === 0 && y.reliability?.habitualLate)
    || ((y.attendedShifts ?? 0) === 0 && x.reliability?.habitualLate);
  const newcomer = newcomerRisk ? cfg.newcomerProtection : 1;
  if (newcomerRisk) flags.push('newcomer_protection');
  const repeat = facts?.repeat && !facts?.mutualBuddy ? cfg.repeatFactor : 1;
  if (facts?.repeat) flags.push('repeat_pair');

  return {
    quality: clamp01(base * reliability * newcomer * repeat),
    base,
    pairFit,
    pairShiftFit,
    users: [x.userId, y.userId],
    components: {
      interests,
      age,
      experience: experience.value,
      standing,
      pair_fit: pairFit,
      org_quality: fx.org,
      cause: { a: fx.cause, b: fy.cause },
      travel: { a: fx.travel, b: fy.travel },
      affinity: { a: fx.affinity, b: fy.affinity },
      shift_fit: { a: fx.value, b: fy.value },
      pair_shift_fit: pairShiftFit,
    },
    multipliers: { reliability, newcomer_protection: newcomer, repeat },
    flags,
  };
}

module.exports = {
  interestOverlap,
  ageCloseness,
  experienceFit,
  orgStanding,
  standingFit,
  orgQuality,
  causeFit,
  travelFit,
  shiftFitFor,
  reliabilityRisk,
  scoreTriple,
};
