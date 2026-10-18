// Chooses pairs across the whole pool of open searches in one run. Pure:
// it takes person objects (person.js), shift objects, prior-pairing facts
// and "now", and returns an ordered plan; lib/matchingRunner.js reads the
// database into those inputs and writes the plan back.
//
// Approach: build every eligible (pair, shared shift) edge, then accept
// edges best-first (greedy), keeping shift capacity in memory. If an edge's
// best shift fills up, it falls back to its next shift and is re-sorted.
// A pairing only forms once its quality reaches the match bar, which is
// high while the shift is far off and falls as it nears, so early bookers
// wait for a better match. Fairness: rematches go first, then searches close to their deadline, then
// mutual buddy requests; within a tier, time already waited adds a capped
// boost, so a long waiter only loses to a clearly better pairing.
const { hardFiltersPass } = require('./engine');
const { scoreTriple } = require('./score');

const HOUR_MS = 3600 * 1000;
const pairKey = (u1, u2) => (String(u1) < String(u2) ? `${u1}|${u2}` : `${u2}|${u1}`);

// Share of its allowed search time a request has used, 0..1.
function pressure(person, nowMs) {
  const span = person.deadlineMs - person.createdAtMs;
  if (!(span > 0)) return 1;
  return Math.max(0, Math.min(1, (nowMs - person.createdAtMs) / span));
}

function isUrgent(person, nowMs, cfg) {
  if (person.kind === 'rematch') return true;
  return Number.isFinite(person.deadlineMs) && person.deadlineMs - nowMs <= cfg.urgentWithinHours * HOUR_MS;
}

// The bar a pairing on this shift must reach for this one person.
function personalBar(person, shift, nowMs, cfg) {
  if (person.matchPreference === 'anyone' || person.anchorShiftId || person.kind !== 'standard') return 0;
  const bar = cfg.matchBar;
  const hours = (Date.parse(shift.starts_at) - nowMs) / HOUR_MS;
  const byShift = hours >= bar.farHoursBeforeShift ? bar.farValue
    : hours <= bar.floorHoursBeforeShift ? 0
      : bar.farValue * (hours - bar.floorHoursBeforeShift) / (bar.farHoursBeforeShift - bar.floorHoursBeforeShift);
  const bySearchTime = bar.farValue * (1 - pressure(person, nowMs));
  return Math.max(0, Math.min(byShift, bySearchTime));
}

// Both people's standards apply, so the pair needs the higher of the two.
// Mutual buddy requests skip the bar (they skip ranking altogether).
function matchBar(a, b, shift, nowMs, cfg, mutualBuddy = false) {
  if (mutualBuddy) return 0;
  return Math.max(personalBar(a, shift, nowMs, cfg), personalBar(b, shift, nowMs, cfg));
}

function ageBandOk(person, other) {
  if (person.ageMin != null && (other.age == null || other.age < person.ageMin)) return false;
  if (person.ageMax != null && (other.age == null || other.age > person.ageMax)) return false;
  return true;
}

const hardRow = (p) => ({
  id: p.userId, age: p.age, verified: p.verified, gender: p.gender, gender_pref: p.genderPref,
  flagged_users: JSON.stringify(p.flaggedUsers ?? []),
});

// pairFacts: { declined: Set, active: Set, prior: Set } of pairKey(userA, userB)
function pairEligible(a, b, pairFacts) {
  if (a.userId === b.userId) return { ok: false, reason: 'same_user' };
  const hard = hardFiltersPass(hardRow(a), hardRow(b));
  if (!hard.pass) return { ok: false, reason: hard.reasons[0] };
  if (!ageBandOk(a, b) || !ageBandOk(b, a)) return { ok: false, reason: 'age_band' };
  const key = pairKey(a.userId, b.userId);
  if (pairFacts?.declined?.has(key)) return { ok: false, reason: 'declined_before' };
  if (pairFacts?.active?.has(key)) return { ok: false, reason: 'already_paired' };
  if (a.buddyUserId || b.buddyUserId) {
    // Buddy requests pair only when mutual: each asked for the other.
    if (a.buddyUserId !== b.userId || b.buddyUserId !== a.userId) return { ok: false, reason: 'buddy_not_mutual' };
  }
  // Two anchored requests can only share their (common) anchored shift.
  if (a.anchorShiftId && b.anchorShiftId && a.anchorShiftId !== b.anchorShiftId) return { ok: false, reason: 'different_anchors' };
  return { ok: true, reason: null };
}

const spotsNeeded = (a, b) => (a.anchorShiftId ? 0 : 1) + (b.anchorShiftId ? 0 : 1);

// Every eligible pair with at least one shared shift that has room, with
// its shifts ranked: not demoted first (an org either person privately
// rated a poor fit), then best fit for the pair, then earliest, then id.
function buildEdges({ persons, shifts, pairFacts, nowMs, cfg, capacity }) {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const room = capacity ?? new Map(shifts.map((s) => [s.id, s.capacity_remaining]));
  const edges = [];
  const exclusions = new Map(persons.map((p) => [p.requestId, {}]));
  const held = new Set(); // had a partner and shift, but no pairing reached the bar yet
  const exclude = (p, reason) => {
    const counts = exclusions.get(p.requestId);
    counts[reason] = (counts[reason] ?? 0) + 1;
  };
  const sorted = [...persons].sort((p, q) => (p.requestId < q.requestId ? -1 : p.requestId > q.requestId ? 1 : 0));

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const eligible = pairEligible(a, b, pairFacts);
      if (!eligible.ok) {
        exclude(a, eligible.reason);
        exclude(b, eligible.reason);
        continue;
      }
      const bShifts = new Set(b.eligibleShiftIds);
      const need = spotsNeeded(a, b);
      const mutualBuddy = Boolean(a.buddyUserId && b.buddyUserId);
      const facts = { repeat: Boolean(pairFacts?.prior?.has(pairKey(a.userId, b.userId))), mutualBuddy };
      const poor = new Set([...(a.poorFitOrgIds ?? []), ...(b.poorFitOrgIds ?? [])]);
      const options = [];
      for (const id of new Set(a.eligibleShiftIds)) {
        if (!bShifts.has(id)) continue;
        const shift = shiftById.get(id);
        if (!shift || (room.get(id) ?? 0) < need) continue;
        const score = scoreTriple(a, b, shift, facts, cfg);
        const bar = matchBar(a, b, shift, nowMs, cfg, mutualBuddy);
        options.push({ shift, need, demoted: poor.has(shift.org_id), score, bar, passes: score.quality >= bar });
      }
      if (options.length === 0) {
        exclude(a, 'no_shared_shift_with_room');
        exclude(b, 'no_shared_shift_with_room');
        continue;
      }
      if (!options.some((o) => o.passes)) {
        exclude(a, 'below_match_bar');
        exclude(b, 'below_match_bar');
        held.add(a.requestId);
        held.add(b.requestId);
        continue;
      }
      options.splice(0, options.length, ...options.filter((o) => o.passes));
      options.sort((o1, o2) => (o1.demoted - o2.demoted)
        || (o2.score.pairShiftFit - o1.score.pairShiftFit)
        || o1.shift.starts_at.localeCompare(o2.shift.starts_at)
        || (o1.shift.id < o2.shift.id ? -1 : o1.shift.id > o2.shift.id ? 1 : 0));
      edges.push(makeEdge(a, b, options, mutualBuddy, nowMs, cfg));
    }
  }
  return { edges, exclusions, held };
}

function makeEdge(a, b, options, mutualBuddy, nowMs, cfg) {
  const urgentA = isUrgent(a, nowMs, cfg);
  const urgentB = isUrgent(b, nowMs, cfg);
  const rematch = a.kind === 'rematch' || b.kind === 'rematch';
  const tier = rematch ? 3 : (urgentA || urgentB) ? 2 : mutualBuddy ? 1 : 0;
  const urgentDeadlines = [];
  if (tier >= 2) {
    for (const [p, urgent] of [[a, urgentA], [b, urgentB]]) if (urgent && (tier === 2 || p.kind === 'rematch')) urgentDeadlines.push(p.deadlineMs);
  }
  const [older, younger] = a.createdAtMs <= b.createdAtMs ? [a, b] : [b, a];
  const edge = {
    a, b, options, idx: 0, tier, mutualBuddy,
    pressure: { a: pressure(a, nowMs), b: pressure(b, nowMs) },
    urgent: { a: urgentA, b: urgentB },
    urgentDeadline: urgentDeadlines.length ? Math.min(...urgentDeadlines) : 0,
    olderCreated: older.createdAtMs,
    youngerCreated: younger.createdAtMs,
    key: a.requestId < b.requestId ? `${a.requestId}|${b.requestId}` : `${b.requestId}|${a.requestId}`,
  };
  setCurrent(edge, cfg);
  return edge;
}

function setCurrent(edge, cfg) {
  const option = edge.options[edge.idx];
  edge.quality = option.score.quality;
  edge.adjusted = option.score.quality + cfg.fairnessWeight * Math.max(edge.pressure.a, edge.pressure.b);
}

function compareEdges(e1, e2) {
  return (e2.tier - e1.tier)
    || (e1.urgentDeadline - e2.urgentDeadline)
    || (e2.adjusted - e1.adjusted)
    || (e1.olderCreated - e2.olderCreated)
    || (e1.youngerCreated - e2.youngerCreated)
    || (e1.key < e2.key ? -1 : e1.key > e2.key ? 1 : 0);
}

function insertSorted(list, edge) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareEdges(list[mid], edge) <= 0) lo = mid + 1;
    else hi = mid;
  }
  list.splice(lo, 0, edge);
}

function breakdownFor(edge, cfg) {
  const option = edge.options[edge.idx];
  const s = option.score;
  // Report a/b in the scorer's canonical order (users[0], users[1]).
  const flip = s.users[0] !== edge.a.userId;
  const side = (v) => (flip ? { a: v.b, b: v.a } : v);
  return {
    config_version: cfg.version,
    users: s.users,
    quality: s.quality,
    adjusted: edge.adjusted,
    tier: edge.tier,
    pressure: side(edge.pressure),
    urgent: side(edge.urgent),
    components: s.components,
    multipliers: s.multipliers,
    flags: s.flags,
    match_bar: option.bar,
    shift_choice: edge.options.slice(edge.idx, edge.idx + 3).map((o) => ({
      shift_id: o.shift.id, pair_shift_fit: o.score.pairShiftFit, demoted: o.demoted, match_bar: o.bar,
    })),
  };
}

// Rounds every number in a breakdown to 3 decimals (storage/display only;
// ordering always uses the unrounded values).
function roundBreakdown(value) {
  if (typeof value === 'number') return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(roundBreakdown);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundBreakdown(v)]));
  return value;
}

// → { matches: [{ aRequestId, bRequestId, shiftId, tier, quality, adjusted,
//      breakdown, flags }] in acceptance order, unmatchedRequestIds, edges, exclusions }
function planAssignments({ persons, shifts, pairFacts, nowMs, config: cfg }) {
  const capacity = new Map(shifts.map((s) => [s.id, s.capacity_remaining]));
  const { edges, exclusions, held } = buildEdges({ persons, shifts, pairFacts, nowMs, cfg, capacity });
  const queue = [...edges].sort(compareEdges);
  const matched = new Set();
  const matches = [];

  while (queue.length) {
    const edge = queue.shift();
    if (matched.has(edge.a.requestId) || matched.has(edge.b.requestId)) continue;
    const option = edge.options[edge.idx];
    if ((capacity.get(option.shift.id) ?? 0) < option.need) {
      // Lazy greedy: fall back to this pair's next shift that still has room.
      let next = edge.idx + 1;
      while (next < edge.options.length && (capacity.get(edge.options[next].shift.id) ?? 0) < edge.options[next].need) next++;
      if (next >= edge.options.length) continue;
      edge.idx = next;
      setCurrent(edge, cfg);
      insertSorted(queue, edge);
      continue;
    }
    capacity.set(option.shift.id, capacity.get(option.shift.id) - option.need);
    matched.add(edge.a.requestId);
    matched.add(edge.b.requestId);
    const flags = [...option.score.flags];
    if (edge.mutualBuddy) flags.unshift('buddy_pairing');
    matches.push({
      aRequestId: edge.a.requestId,
      bRequestId: edge.b.requestId,
      shiftId: option.shift.id,
      tier: edge.tier,
      quality: edge.quality,
      adjusted: edge.adjusted,
      breakdown: breakdownFor(edge, cfg),
      flags,
    });
  }

  const unmatchedRequestIds = persons.map((p) => p.requestId).filter((id) => !matched.has(id));
  const heldRequestIds = unmatchedRequestIds.filter((id) => held.has(id));
  return { matches, unmatchedRequestIds, heldRequestIds, edges, exclusions };
}

module.exports = {
  pairKey,
  pressure,
  isUrgent,
  personalBar,
  matchBar,
  pairEligible,
  buildEdges,
  planAssignments,
  breakdownFor,
  roundBreakdown,
  compareEdges,
};
