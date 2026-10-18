// Pure checks of the pool-wide planner (matching/assign.js): hard filters
// always win, capacity is never exceeded, fairness and starvation
// protection, buddy handling, determinism, and the inputs matching must
// ignore. No server, no database. Checks are named by behaviour.
const { MATCHING_CONFIG: cfg, withOverrides } = require('./matching/config');
const { planAssignments, pairEligible, buildEdges, compareEdges, pairKey } = require('./matching/assign');
const { scoreTriple } = require('./matching/score');
const { toMatchPerson } = require('./matching/person');

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

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 4242;
const rand = mulberry32(SEED);
console.log(`seed ${SEED}`);
const pick = (list) => list[Math.floor(rand() * list.length)];

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const SJ = { lat: 37.3382, lng: -121.8863 };
const CAUSES = ['Food banks & shelters', 'Animal welfare', 'Environmental cleanups', 'Youth mentorship', 'Elder care', 'Community organizing'];
const HOBBIES = ['hiking', 'chess', 'music', 'board games', 'cooking', 'kayaking', 'running'];
const noFacts = () => ({ declined: new Set(), active: new Set(), prior: new Set() });

function person(id, o = {}) {
  const created = NOW - (o.waitedHours ?? 1) * HOUR;
  return {
    requestId: `r-${id}`, userId: `u-${id}`, kind: 'standard', createdAtMs: created, deadlineMs: o.deadlineMs ?? created + 4 * DAY,
    buddyUserId: null, anchorShiftId: null,
    age: 30, gender: 'Female', genderPref: 'any', verified: true, flaggedUsers: [],
    causes: ['Animal welfare'], interests: ['hiking'], home: SJ, radiusMiles: 15, ageMin: null, ageMax: null,
    attendedShifts: 0, attendedByCause: {}, reliability: { attended: 0, late: 0, noShow: 0, habitualLate: false },
    affinity: { org: {}, cause: {} }, poorFitOrgIds: [], eligibleShiftIds: ['s1'],
    ...o,
  };
}
function shift(id, o = {}) {
  return { id, org_id: o.org_id ?? 'o1', cause_tags: ['Animal welfare'], starts_at: o.starts_at ?? '2026-10-21T16:00:00Z', location: SJ,
    capacity_remaining: 6, org: { mission_tags: ['Animal welfare'] }, ...o };
}
const plan = (persons, shifts, extra = {}) => planAssignments({ persons, shifts, pairFacts: extra.pairFacts ?? noFacts(), nowMs: extra.nowMs ?? NOW, config: extra.config ?? cfg });
const pairsOf = (p) => p.matches.map((m) => [m.aRequestId, m.bRequestId].sort().join('+')).sort();
const paired = (p, x, y) => pairsOf(p).includes([`r-${x}`, `r-${y}`].sort().join('+'));

// ── Generated pools: hard filters and capacity ──
function randomPool(n, shiftCount) {
  const shifts = Array.from({ length: shiftCount }, (_, i) => shift(`s${i}`, {
    org_id: `o${i % 5}`, cause_tags: [pick(CAUSES)], capacity_remaining: Math.floor(rand() * 5),
    starts_at: new Date(NOW + (2 + rand() * 5) * DAY).toISOString(),
    location: { lat: SJ.lat + (rand() - 0.5) * 0.3, lng: SJ.lng + (rand() - 0.5) * 0.3 },
  }));
  const persons = Array.from({ length: n }, (_, i) => person(`g${i}`, {
    age: rand() < 0.05 ? 17 : 18 + Math.floor(rand() * 55),
    verified: rand() > 0.05,
    gender: pick(['Female', 'Male', 'Non-binary']),
    genderPref: rand() < 0.25 ? 'same_gender_only' : 'any',
    causes: [pick(CAUSES), pick(CAUSES)],
    interests: [pick(HOBBIES), pick(HOBBIES)],
    waitedHours: rand() * 90,
    ageMin: rand() < 0.1 ? 25 : null,
    ageMax: rand() < 0.1 ? 45 : null,
    attendedShifts: Math.floor(rand() * 15),
    eligibleShiftIds: shifts.filter(() => rand() < 0.4).map((s) => s.id),
  }));
  for (const p of persons) if (rand() < 0.1) p.flaggedUsers = [pick(persons).userId];
  const facts = noFacts();
  for (let i = 0; i < n / 4; i++) facts.declined.add(pairKey(pick(persons).userId, pick(persons).userId));
  for (let i = 0; i < n / 6; i++) facts.active.add(pairKey(pick(persons).userId, pick(persons).userId));
  return { persons, shifts, facts };
}

let hardOk = true;
let sharedOk = true;
let capacityOk = true;
let onceOk = true;
for (let round = 0; round < 25; round++) {
  const { persons, shifts, facts } = randomPool(40, 12);
  // Inflate the soft signals of every ineligible pair: identical age and interests.
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      if (!pairEligible(persons[i], persons[j], facts).ok) persons[j].interests = [...persons[i].interests];
    }
  }
  const p = plan(persons, shifts, { pairFacts: facts });
  const byReq = new Map(persons.map((x) => [x.requestId, x]));
  const used = new Map();
  const seen = new Set();
  for (const m of p.matches) {
    const a = byReq.get(m.aRequestId);
    const b = byReq.get(m.bRequestId);
    if (!pairEligible(a, b, facts).ok) hardOk = false;
    if (!a.eligibleShiftIds.includes(m.shiftId) || !b.eligibleShiftIds.includes(m.shiftId)) sharedOk = false;
    used.set(m.shiftId, (used.get(m.shiftId) ?? 0) + 2);
    if (seen.has(a.requestId) || seen.has(b.requestId)) onceOk = false;
    seen.add(a.requestId);
    seen.add(b.requestId);
  }
  for (const s of shifts) if ((used.get(s.id) ?? 0) > s.capacity_remaining) capacityOk = false;
}
check('hard filters always win: an ineligible pair is never planned however well it scores', hardOk);
check('every planned pair passes every hard filter and shares a shift both people can take', hardOk && sharedOk);
check('no request is planned twice and no shift is planned past its capacity', onceOk && capacityOk);

check('a shift with one spot left never gets a pair', plan([person('a'), person('b')], [shift('s1', { capacity_remaining: 1 })]).matches.length === 0);
check('odd capacity leaves the extra spot empty', plan([person('a'), person('b'), person('c'), person('d')], [shift('s1', { capacity_remaining: 3 })]).matches.length === 1);

// ── Contested last spots ──
{
  const persons = [
    person('a', { genderPref: 'same_gender_only', interests: ['chess', 'music'] }),
    person('b', { genderPref: 'same_gender_only', interests: ['chess', 'music'] }),
    person('c', { gender: 'Male', genderPref: 'same_gender_only', interests: ['golf'], age: 50 }),
    person('d', { gender: 'Male', genderPref: 'same_gender_only', interests: ['tennis'], age: 22 }),
  ];
  const shifts = [shift('s1', { capacity_remaining: 2 })];
  const { edges } = buildEdges({ persons, shifts, pairFacts: noFacts(), nowMs: NOW, cfg });
  const first = [...edges].sort(compareEdges)[0];
  const p = plan(persons, shifts);
  check('a contested last pair of spots goes to the edge that sorts first',
    p.matches.length === 1 && p.matches[0].aRequestId === first.a.requestId && p.matches[0].bRequestId === first.b.requestId && paired(p, 'a', 'b'));
}

// ── Fit vs arrival ──
{
  const persons = [
    person('A', { waitedHours: 4, age: 24, interests: ['chess', 'hiking', 'music'] }),
    person('C', { waitedHours: 3, age: 55, interests: ['golf', 'birding'] }),
    person('B', { waitedHours: 2, age: 25, interests: ['chess', 'hiking', 'music'] }),
    person('D', { waitedHours: 1, age: 57, interests: ['golf', 'birding'] }),
  ];
  const p = plan(persons, [shift('s1', { capacity_remaining: 4 })]);
  check('a run that sees the whole pool pairs by fit, not by arrival order', paired(p, 'A', 'B') && paired(p, 'C', 'D'), pairsOf(p));
}
{
  const p = plan([person('x', { waitedHours: 3 }), person('y', { waitedHours: 2 }), person('z', { waitedHours: 1 })], [shift('s1', { capacity_remaining: 2 })]);
  check('with identical profiles the longest waiter is served first', paired(p, 'x', 'y'), pairsOf(p));
}

// ── Tiers ──
{
  // R is a rematch anchored on s1 and fits X less well than Y does.
  const persons = [
    person('R', { kind: 'rematch', anchorShiftId: 's1', age: 60, interests: ['golf'], waitedHours: 0.1, gender: 'Male' }),
    person('X', { age: 28, interests: ['chess', 'music'] }),
    person('Y', { age: 28, interests: ['chess', 'music'], genderPref: 'same_gender_only' }),
  ];
  const p = plan(persons, [shift('s1', { capacity_remaining: 1 })]);
  check('a rematch is served before everything else', paired(p, 'R', 'X'), pairsOf(p));
}
{
  const persons = [
    person('L', { waitedHours: 80, deadlineMs: NOW + 10 * HOUR, age: 66, interests: ['golf'] }),
    person('H1', { waitedHours: 0.2, age: 27, interests: ['chess', 'music', 'hiking'] }),
    person('H2', { waitedHours: 0.1, age: 27, interests: ['chess', 'music', 'hiking'] }),
  ];
  const p = plan(persons, [shift('s1', { capacity_remaining: 2 })]);
  check('a search close to its deadline beats a better-fitting fresh pair', pairsOf(p).some((x) => x.includes('r-L')), pairsOf(p));
}

// ── Starvation bound ──
function simulate(config) {
  const S = person('S', { waitedHours: 0, age: 71, interests: ['birding'], attendedShifts: 0 });
  S.createdAtMs = NOW;
  S.deadlineMs = NOW + 4 * DAY;
  for (let run = 1; run * 6 * HOUR < 4 * DAY; run++) {
    const nowMs = NOW + run * 6 * HOUR;
    const fresh = [`n${run}a`, `n${run}b`].map((id) => {
      const p = person(id, { age: 29, interests: ['chess', 'music', 'hiking'], eligibleShiftIds: [`s${run}`] });
      p.createdAtMs = nowMs - 60 * 1000;
      p.deadlineMs = p.createdAtMs + 4 * DAY;
      return p;
    });
    const pool = [{ ...S, eligibleShiftIds: [`s${run}`] }, ...fresh];
    const p = plan(pool, [shift(`s${run}`, { capacity_remaining: 2 })], { nowMs, config });
    if (p.matches.some((m) => m.aRequestId === 'r-S' || m.bRequestId === 'r-S')) return nowMs;
  }
  return null;
}
{
  const servedAt = simulate(cfg);
  const starvedAt = simulate(withOverrides({ fairnessWeight: 0, urgentWithinHours: 0 }));
  const urgentFrom = NOW + 4 * DAY - cfg.urgentWithinHours * HOUR;
  check('starvation bound: a hard-to-match search is matched by the time it becomes urgent',
    servedAt != null && servedAt <= urgentFrom + 6 * HOUR && starvedAt == null, { servedAt, urgentFrom, starvedAt });
}

// ── Buddies ──
{
  const persons = [
    person('b1', { buddyUserId: 'u-b2', age: 60, interests: ['golf'] }),
    person('b2', { buddyUserId: 'u-b1', age: 25, interests: ['chess'] }),
    person('st', { age: 25, interests: ['chess'] }),
  ];
  const p = plan(persons, [shift('s1', { capacity_remaining: 4 })]);
  check('a mutual buddy request pairs the buddies even when a stranger fits better', paired(p, 'b1', 'b2') && p.matches[0].flags.includes('buddy_pairing'), pairsOf(p));
}
{
  const p = plan([person('b1', { buddyUserId: 'u-b2' }), person('b2'), person('st')], [shift('s1', { capacity_remaining: 4 })]);
  check('a one-sided buddy request never pairs with someone else', !pairsOf(p).some((x) => x.includes('r-b1')) && paired(p, 'b2', 'st'), pairsOf(p));
}

// ── Determinism and ignored inputs ──
const big = randomPool(60, 15);
const planJson = (persons) => JSON.stringify(plan(persons, big.shifts, { pairFacts: big.facts }).matches);
const baseline = planJson(big.persons);
check('the plan is identical for the same inputs and clock', planJson(big.persons) === baseline);
let shuffleOk = true;
for (let i = 0; i < 10; i++) {
  const copy = [...big.persons];
  for (let j = copy.length - 1; j > 0; j--) {
    const k = Math.floor(rand() * (j + 1));
    [copy[j], copy[k]] = [copy[k], copy[j]];
  }
  if (planJson(copy) !== baseline) shuffleOk = false;
}
check('shuffling the input order does not change the plan', shuffleOk);

{
  const rows = Array.from({ length: 30 }, (_, i) => ({
    user: { id: `u${i}`, age: 20 + (i * 7) % 40, gender: i % 2 ? 'Male' : 'Female', gender_pref: 'any', verified: 1, flagged_users: '[]',
      cause_tags: JSON.stringify([CAUSES[i % 3], CAUSES[(i + 1) % 6]]), interest_tags: JSON.stringify([HOBBIES[i % 7], HOBBIES[(i * 3) % 7]]),
      location_lat: SJ.lat + (i % 5) * 0.01, location_lng: SJ.lng, travel_radius_miles: 20 },
    request: { id: `r${i}`, kind: 'standard', created_at: new Date(NOW - i * HOUR).toISOString(), search_deadline: new Date(NOW + 3 * DAY).toISOString() },
  }));
  const shifts = CAUSES.map((c, i) => shift(`c${i}`, { cause_tags: [c], org: { mission_tags: [c] }, capacity_remaining: 4 }));
  const build = (mutate) => rows.map(({ user, request }, i) => {
    const u = { ...user, ...mutate(i) };
    const causes = JSON.parse(u.cause_tags);
    return toMatchPerson(u, request, { eligibleShiftIds: shifts.filter((s) => s.cause_tags.some((t) => causes.includes(t))).map((s) => s.id) }, cfg);
  });
  const run = (persons) => JSON.stringify(plan(persons, shifts).matches);
  const plain = run(build(() => ({})));
  const noisy = run(build((i) => ({
    premium_until: i % 2 ? '2030-01-01T00:00:00Z' : null, premium_plan: i % 2 ? 'annual' : null,
    seeking: i % 3 ? 'open' : 'friendship_only', volunteering_frequency: ['Weekly', 'Once a month'][i % 2],
    occupation: `Job ${i}`, bio: `Bio ${i}`, personal_values: `Values ${i}`, display_name: `Name ${i}`,
  })));
  check('Premium status, seeking, volunteering frequency and free-text fields do not change the plan', plain === noisy);
  const regendered = run(build((i) => ({ gender: ['Female', 'Male', 'Non-binary'][(i * 5) % 3] })));
  check('gender changes nothing when both partners accept anyone', plain === regendered);
}

// ── Learned affinity in the planner ──
{
  const { learnAffinity } = require('./matching/affinity');
  const s1 = shift('s1');
  const a = person('a');
  const b = person('b');
  const c = person('c');
  const before = JSON.stringify(scoreTriple(b, c, s1, {}, cfg));
  const aRated = { ...a, affinity: learnAffinity(Array.from({ length: 10 }, () => ({ orgId: 'o1', personalFit: 1, causeTags: ['Animal welfare'] })), cfg) };
  void aRated;
  const after = JSON.stringify(scoreTriple(b, c, s1, {}, cfg));
  check("learned affinity: one user's ratings never change another user's scores with other partners", before === after
    && scoreTriple(aRated, b, s1, {}, cfg).components.shift_fit.b === scoreTriple(a, b, s1, {}, cfg).components.shift_fit.b);

  const early = shift('s1', { org_id: 'o1', starts_at: '2026-10-20T16:00:00Z' });
  const later = shift('s2', { org_id: 'o2', starts_at: '2026-10-22T16:00:00Z' });
  const both = (p) => ({ ...p, eligibleShiftIds: ['s1', 's2'] });
  const chosen = (x) => plan([both(x), both(person('b'))], [early, later]).matches[0]?.shiftId;
  const lovesO2 = { ...person('a'), affinity: learnAffinity(Array.from({ length: 8 }, () => ({ orgId: 'o2', personalFit: 5, causeTags: [] })), cfg) };
  const dislikesO1 = { ...person('a'), poorFitOrgIds: ['o1'] };
  check('a strongly liked org or cause can tip the shift choice, a disliked org is demoted',
    chosen(person('a')) === 's1' && chosen(lovesO2) === 's2' && chosen(dislikesO1) === 's2',
    [chosen(person('a')), chosen(lovesO2), chosen(dislikesO1)]);
}

// ── Time budget ──
{
  const { persons, shifts, facts } = randomPool(150, 40);
  const t0 = process.hrtime.bigint();
  plan(persons, shifts, { pairFacts: facts });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`planner: 150 searches, 40 shifts in ${ms.toFixed(1)} ms`);
  check('a 150-search, 40-shift pool plans within the time budget', ms < 3000, ms);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
