// Pure-function checks of matching/engine.js and the adjacency table: no
// server, no database. Inputs are built from tag membership only and the
// assertions are pass/fail outcomes and match levels, not scores.
const { hardFiltersPass, passesShiftGate } = require('./matching/engine');
const { ADJACENCY_TABLE } = require('./matching/adjacency');

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

const user = (causes, extra = {}) => ({ id: extra.id ?? 'u', age: 30, verified: 1, gender: 'Female', gender_pref: 'any', flagged_users: '[]', cause_tags: JSON.stringify(causes), ...extra });
const shift = (shiftTags, missionTags) => ({ cause_tags: shiftTags, location: null, org: { verified: true, mission_tags: missionTags } });

// A pair of tags that are close matches, and a tag adjacent to neither.
const [closeA, closeB] = ['Animal welfare', 'Environmental cleanups'];
const unrelated = 'Elder care';
check('fixture: the chosen close pair is listed as adjacent', ADJACENCY_TABLE[closeA].includes(closeB));
check('fixture: the unrelated tag is adjacent to neither', !ADJACENCY_TABLE[unrelated].includes(closeA) && !ADJACENCY_TABLE[unrelated].includes(closeB));

// ── Shift gate (alignment) ──
check('an exact shift-cause match with no org signal clears the gate', passesShiftGate(user([closeA]), shift([closeA], [unrelated])).pass);
check('an org-mission match alone does not clear the gate', !passesShiftGate(user([closeA]), shift([unrelated], [closeA])).pass);
check('close matches on both shift and org clear the gate (the boundary is inclusive)', passesShiftGate(user([closeA]), shift([closeB], [closeB])).pass);
check('a close match on the shift alone does not clear the gate', !passesShiftGate(user([closeA]), shift([closeB], [unrelated])).pass);
const exactAndClose = passesShiftGate(user([closeA, closeB]), shift([closeA], [unrelated]));
check('an exact match is not added on top of a close match', exactAndClose.alignment.shiftLevel === 'exact' && exactAndClose.alignment.closeMatchUsed === false);
check('a close shift match backed by an exact org match clears the gate', passesShiftGate(user([closeA]), shift([closeB], [closeA])).pass);
check('an exact shift match with a close org match clears the gate', passesShiftGate(user([closeA]), shift([closeA], [closeB])).pass);
check('exact matches on both clear the gate', passesShiftGate(user([closeA]), shift([closeA], [closeA])).pass);
check('a close org match alone does not clear the gate', !passesShiftGate(user([closeA]), shift([unrelated], [closeB])).pass);
check('no match on either does not clear the gate', !passesShiftGate(user([closeA]), shift([unrelated], [unrelated])).pass);
check('a close match is reported as such (for the pairing flags)', passesShiftGate(user([closeA]), shift([closeB], [closeB])).alignment.closeMatchUsed === true);
check("an unverified org's shift never clears the gate", !passesShiftGate(user([closeA]), { ...shift([closeA], [closeA]), org: { verified: false, mission_tags: [closeA] } }).pass);
check('an empty cause list clears nothing', !passesShiftGate(user([]), shift([closeA], [closeA])).pass);
check('a missing cause list clears nothing (not treated as a match)', !passesShiftGate({ ...user([]), cause_tags: undefined }, shift([closeA], [closeA])).pass);
const far = { ...shift([closeA], [closeA]), location: { lat: 37.4419, lng: -122.143 } };
check('a shift outside the travel radius is rejected', !passesShiftGate(user([closeA], { location_lat: 37.3382, location_lng: -121.8863, travel_radius_miles: 5 }), far).pass);
check('…and inside it is accepted', passesShiftGate(user([closeA], { location_lat: 37.3382, location_lng: -121.8863, travel_radius_miles: 30 }), far).pass);

// ── Hard filters ──
const a = user([closeA], { id: 'a' });
const b = user([closeA], { id: 'b' });
check('two eligible adults pass', hardFiltersPass(a, b).pass);
check('a flag from A blocks the pair', !hardFiltersPass({ ...a, flagged_users: '["b"]' }, b).pass);
check('a flag from B blocks the pair (either direction)', !hardFiltersPass(a, { ...b, flagged_users: '["a"]' }).pass);
check('an under-18 partner is rejected', !hardFiltersPass(a, { ...b, age: 17 }).pass);
check('a missing age is rejected, not waved through', !hardFiltersPass(a, { ...b, age: null }).pass);
check('an unverified partner is rejected', !hardFiltersPass(a, { ...b, verified: 0 }).pass);
check('same-gender-only is respected in both directions',
  !hardFiltersPass({ ...a, gender_pref: 'same_gender_only' }, { ...b, gender: 'Male' }).pass
  && !hardFiltersPass({ ...a, gender: 'Male' }, { ...b, gender_pref: 'same_gender_only' }).pass);
check('a user is never paired with themselves', !hardFiltersPass(a, { ...a }).pass);

// ── Adjacency table is symmetric (config check) ──
const asymmetric = [];
for (const [tag, neighbours] of Object.entries(ADJACENCY_TABLE)) {
  for (const n of neighbours) if (!(ADJACENCY_TABLE[n] || []).includes(tag)) asymmetric.push(`${tag} → ${n}`);
}
check('every adjacency edge has its reverse', asymmetric.length === 0, asymmetric);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
