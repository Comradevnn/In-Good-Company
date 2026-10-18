// Pure checks of the soft-ranking components (matching/score.js,
// person.js, affinity.js, config.js): ranges, edge cases, unknown handling
// and how scoreTriple composes them. No server, no database. Checks are
// about behaviour (ordering, bounds, symmetry), not specific numbers.
const { MATCHING_CONFIG: cfg, validateConfig, withOverrides } = require('./matching/config');
const score = require('./matching/score');
const { toMatchPerson } = require('./matching/person');
const { learnAffinity, shiftAffinity } = require('./matching/affinity');

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

// Small seeded PRNG so generated inputs are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20261018;
const rand = mulberry32(SEED);
console.log(`seed ${SEED}`);
const pick = (list) => list[Math.floor(rand() * list.length)];
const CAUSES = ['Food banks & shelters', 'Animal welfare', 'Environmental cleanups', 'Youth mentorship', 'Elder care', 'Community organizing'];
const HOBBIES = ['hiking', 'chess', 'music', 'board games', 'cooking', 'kayaking', 'running'];
const SJ = { lat: 37.3382, lng: -121.8863 };

const person = (o = {}) => ({
  requestId: `r-${o.userId ?? 'x'}`, userId: o.userId ?? 'x', kind: 'standard', createdAtMs: 0, deadlineMs: 1,
  age: 30, causes: ['Animal welfare'], interests: ['hiking'], home: SJ, radiusMiles: 15,
  attendedShifts: 0, attendedByCause: {}, reliability: { attended: 0, late: 0, noShow: 0, habitualLate: false },
  affinity: { org: {}, cause: {} }, poorFitOrgIds: [], eligibleShiftIds: [], ...o,
});
const shift = (o = {}) => ({ id: 's', org_id: 'o', cause_tags: ['Animal welfare'], starts_at: '2026-10-21T16:00:00Z', location: SJ, org: { mission_tags: ['Animal welfare'] }, ...o });
const randomPerson = (id) => person({
  userId: id,
  age: 18 + Math.floor(rand() * 60),
  causes: [pick(CAUSES), pick(CAUSES)],
  interests: rand() < 0.2 ? [] : [pick(HOBBIES), pick(HOBBIES)],
  home: rand() < 0.2 ? null : { lat: SJ.lat + (rand() - 0.5) * 0.4, lng: SJ.lng + (rand() - 0.5) * 0.4 },
  radiusMiles: 5 + rand() * 30,
  attendedShifts: Math.floor(rand() * 20),
  attendedByCause: { [pick(CAUSES)]: Math.floor(rand() * 6) },
  reliability: { attended: Math.floor(rand() * 10), late: Math.floor(rand() * 3), noShow: Math.floor(rand() * 2), habitualLate: rand() < 0.1 },
  affinity: learnAffinity([{ orgId: 'o', personalFit: 1 + Math.floor(rand() * 5), causeTags: [pick(CAUSES)] }], cfg),
});
const randomShift = () => shift({ cause_tags: [pick(CAUSES)], org: { mission_tags: [pick(CAUSES)] }, location: { lat: SJ.lat + (rand() - 0.5) * 0.4, lng: SJ.lng + (rand() - 0.5) * 0.4 } });
const inUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

// ── Config ──
check('the shipped config validates and is frozen', validateConfig(cfg).length === 0 && Object.isFrozen(cfg) && Object.isFrozen(cfg.pair), validateConfig(cfg));
check('a config whose weights do not sum to one is rejected', validateConfig(withOverrides({ pair: { interests: 0.9 } })).length > 0);
check('overrides produce a new frozen config and leave the shipped one alone', withOverrides({ fairnessWeight: 0 }).fairnessWeight === 0 && cfg.fairnessWeight > 0 && Object.isFrozen(withOverrides({})));

// ── Components ──
let allInRange = true;
let qualityInRange = true;
const outOfRange = [];
for (let i = 0; i < 400; i++) {
  const a = randomPerson(`a${i}`);
  const b = randomPerson(`b${i}`);
  const s = randomShift();
  const values = [
    score.interestOverlap(a.interests, b.interests, cfg),
    score.ageCloseness(a.age, b.age, cfg),
    score.experienceFit(a, b, s, cfg).value,
    score.causeFit(a, s, cfg),
    score.travelFit(a, s, cfg),
    score.shiftFitFor(a, s, cfg).value,
  ];
  if (!values.every(inUnit)) { allInRange = false; outOfRange.push(values); }
  const t = score.scoreTriple(a, b, s, { repeat: rand() < 0.3, mutualBuddy: false }, cfg);
  if (!inUnit(t.quality) || !inUnit(t.pairFit) || !inUnit(t.pairShiftFit)) qualityInRange = false;
}
check('every component stays within 0..1 for generated inputs', allInRange, outOfRange.slice(0, 2));
check('quality stays within 0..1', qualityInRange);

check('interest overlap ignores case and spacing',
  toMatchPerson({ id: 'u', interest_tags: JSON.stringify(['Board  Games', ' Hiking']) }, { id: 'r' }, {}, cfg).interests.join(',') === 'board games,hiking');
check('no listed interests gets the neutral value, not zero', score.interestOverlap([], ['hiking'], cfg) === cfg.interestsUnknown && cfg.interestsUnknown > 0);
check('identical interests score the maximum', score.interestOverlap(['a', 'b'], ['a', 'b'], cfg) === 1);
check('more shared interests never score lower', score.interestOverlap(['a', 'b', 'c'], ['a', 'b', 'd'], cfg) > score.interestOverlap(['a', 'b', 'c'], ['a', 'x', 'y'], cfg));

let agesMonotone = true;
for (let gap = 0; gap < 60; gap++) if (score.ageCloseness(30, 30 + gap + 1, cfg) > score.ageCloseness(30, 30 + gap, cfg)) agesMonotone = false;
check('closer ages never score lower', agesMonotone && score.ageCloseness(30, 30, cfg) === 1);
check('age closeness is the same in both directions', score.ageCloseness(25, 41, cfg) === score.ageCloseness(41, 25, cfg));

const s0 = shift();
check('two brand-new volunteers are treated as peers', score.experienceFit(person({ userId: 'a' }), person({ userId: 'b' }), s0, cfg).value === 1);
check('two equally seasoned volunteers are treated as peers', score.experienceFit(person({ attendedShifts: 12, attendedByCause: { 'Animal welfare': 4 } }), person({ attendedShifts: 12, attendedByCause: { 'Animal welfare': 4 } }), s0, cfg).value === 1);
const vet = person({ userId: 'v', attendedShifts: 20, attendedByCause: { 'Animal welfare': cfg.mentorMinShiftsInCause + 2 } });
const newbie = person({ userId: 'n' });
const mentor = score.experienceFit(newbie, vet, s0, cfg);
const peerGap = score.experienceFit(person({ attendedShifts: 0 }), person({ attendedShifts: 20 }), shift({ cause_tags: ['Elder care'] }), cfg);
check('a cause newcomer with an experienced partner gets the mentor mix', mentor.mentor && mentor.value > peerGap.value, { mentor, peerGap });
check('…and the pairing carries the mentor_mix flag', score.scoreTriple(newbie, vet, s0, {}, cfg).flags.includes('mentor_mix'));
check('the mentor mix needs real experience in this cause, not just elsewhere',
  !score.experienceFit(newbie, person({ attendedShifts: 20, attendedByCause: { 'Elder care': 9 } }), s0, cfg).mentor);

check('an exact cause match fits better than an adjacent one', score.causeFit(person(), shift(), cfg) > score.causeFit(person({ causes: ['Environmental cleanups'] }), shift(), cfg));
check("an org whose mission doesn't match lowers cause fit", score.causeFit(person(), shift({ org: { mission_tags: ['Elder care'] } }), cfg) < score.causeFit(person(), shift(), cfg));

let travelMonotone = true;
for (let d = 0; d < 0.3; d += 0.01) {
  const near = score.travelFit(person(), shift({ location: { lat: SJ.lat + d, lng: SJ.lng } }), cfg);
  const farther = score.travelFit(person(), shift({ location: { lat: SJ.lat + d + 0.01, lng: SJ.lng } }), cfg);
  if (farther > near) travelMonotone = false;
}
check('a farther shift never scores higher for the same person', travelMonotone);
check('an unknown location gets the neutral travel value', score.travelFit(person({ home: null }), shift(), cfg) === cfg.travelUnknown && score.travelFit(person(), shift({ location: null }), cfg) === cfg.travelUnknown);
check('a wider radius makes the same trip fit better', score.travelFit(person({ radiusMiles: 30 }), shift({ location: { lat: SJ.lat + 0.1, lng: SJ.lng } }), cfg) > score.travelFit(person({ radiusMiles: 10 }), shift({ location: { lat: SJ.lat + 0.1, lng: SJ.lng } }), cfg));

// ── Multipliers ──
check('no reliability history means no penalty', score.scoreTriple(person({ userId: 'a' }), person({ userId: 'b' }), s0, {}, cfg).multipliers.reliability === 1);
const withEvents = (late, noShow, attended = 4) => person({ userId: 'z', reliability: { attended, late, noShow, habitualLate: false } });
const q = (p) => score.scoreTriple(person({ userId: 'a' }), p, s0, {}, cfg).quality;
check('more late cancels or no-shows never raise the score', q(withEvents(1, 0)) <= q(withEvents(0, 0)) && q(withEvents(2, 0)) <= q(withEvents(1, 0)) && q(withEvents(0, 1)) <= q(withEvents(0, 0)));
check('a no-show weighs at least as much as a late cancel', q(withEvents(0, 1)) <= q(withEvents(1, 0)));
check('a perfect record earns no bonus over a new user', score.scoreTriple(person({ userId: 'a' }), withEvents(0, 0, 30), s0, {}, cfg).multipliers.reliability === score.scoreTriple(person({ userId: 'a' }), person({ userId: 'z' }), s0, {}, cfg).multipliers.reliability);
const habitual = person({ userId: 'h', attendedShifts: 6, reliability: { attended: 6, late: 0, noShow: 0, habitualLate: true } });
const protectedPair = score.scoreTriple(newbie, habitual, s0, {}, cfg);
const sameWithoutFlag = score.scoreTriple(newbie, { ...habitual, reliability: { ...habitual.reliability, habitualLate: false } }, s0, {}, cfg);
check('a habitual late canceller with a newcomer is deprioritised, not removed',
  protectedPair.quality > 0 && protectedPair.quality < sameWithoutFlag.quality && protectedPair.flags.includes('newcomer_protection'));
const pa = person({ userId: 'a' });
const pb = person({ userId: 'b' });
const fresh = score.scoreTriple(pa, pb, s0, { repeat: false }, cfg);
const repeat = score.scoreTriple(pa, pb, s0, { repeat: true }, cfg);
check('a repeat partner scores a little lower than a new one', repeat.quality < fresh.quality && repeat.quality > fresh.quality * 0.5 && repeat.flags.includes('repeat_pair'));
check('mutual buddies are not marked down as repeats', score.scoreTriple(pa, pb, s0, { repeat: true, mutualBuddy: true }, cfg).quality === fresh.quality);

// ── Symmetry ──
let symmetric = true;
for (let i = 0; i < 200; i++) {
  const a = randomPerson(`sa${i}`);
  const b = randomPerson(`sb${i}`);
  const s = randomShift();
  const x = score.scoreTriple(a, b, s, { repeat: i % 2 === 0 }, cfg);
  const y = score.scoreTriple(b, a, s, { repeat: i % 2 === 0 }, cfg);
  if (JSON.stringify(x) !== JSON.stringify(y)) symmetric = false;
}
check('the score is identical whichever way round the pair is given', symmetric);

// ── Learned affinity (pure parts) ──
check('learned affinity: no ratings means exactly zero adjustment', shiftAffinity(learnAffinity([], cfg), s0, cfg) === 0);
let bounded = true;
for (let i = 0; i < 300; i++) {
  const ratings = Array.from({ length: Math.floor(rand() * 40) }, () => ({ orgId: pick(['o', 'p']), personalFit: 1 + Math.floor(rand() * 5), causeTags: [pick(CAUSES)] }));
  const v = shiftAffinity(learnAffinity(ratings, cfg), shift({ cause_tags: [pick(CAUSES)] }), cfg);
  if (!(v <= cfg.affinityMaxBoost && v >= -cfg.affinityMaxPenalty)) bounded = false;
}
const allLoved = Array.from({ length: 200 }, () => ({ orgId: 'o', personalFit: 5, causeTags: ['Animal welfare'] }));
const allHated = Array.from({ length: 200 }, () => ({ orgId: 'o', personalFit: 1, causeTags: ['Animal welfare'] }));
check('learned affinity stays within its bounds for any ratings', bounded
  && shiftAffinity(learnAffinity(allLoved, cfg), s0, cfg) < cfg.affinityMaxBoost
  && shiftAffinity(learnAffinity(allHated, cfg), s0, cfg) > -cfg.affinityMaxPenalty);
const one = shiftAffinity(learnAffinity([{ orgId: 'o', personalFit: 5, causeTags: ['Animal welfare'] }], cfg), s0, cfg);
const many = shiftAffinity(learnAffinity(Array.from({ length: 6 }, () => ({ orgId: 'o', personalFit: 5, causeTags: ['Animal welfare'] })), cfg), s0, cfg);
check('one rating nudges the score and more ratings move it further', one > 0 && many > one);
check('a dislike counts for more than a like', -shiftAffinity(learnAffinity([{ orgId: 'o', personalFit: 1, causeTags: [] }], cfg), s0, cfg)
  > shiftAffinity(learnAffinity([{ orgId: 'o', personalFit: 5, causeTags: [] }], cfg), s0, cfg));
check('a neutral rating changes nothing', shiftAffinity(learnAffinity([{ orgId: 'o', personalFit: 3, causeTags: ['Animal welfare'] }], cfg), s0, cfg) === 0);

// ── person.js never copies fields matching must not read ──
const row = { id: 'u', age: 30, gender: 'Female', gender_pref: 'any', verified: 1, flagged_users: '[]', cause_tags: '["Animal welfare"]', interest_tags: '["hiking"]',
  premium_until: '2030-01-01', premium_plan: 'annual', seeking: 'open', volunteering_frequency: 'Weekly', occupation: 'Nurse', bio: 'hi', personal_values: 'kindness', display_name: 'Ana' };
const asJson = JSON.stringify(toMatchPerson(row, { id: 'r', kind: 'standard' }, {}, cfg));
check('the person object carries no tier, seeking, frequency or free text',
  !/premium|annual|seeking|"open"|Weekly|frequency|Nurse|kindness|Ana|"hi"/.test(asJson), asJson);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
