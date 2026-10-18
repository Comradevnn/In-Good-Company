// node --test mobile/onboarding/resume.test.mjs — pure logic, no app runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// resume.js is written for Metro (ESM syntax in a .js file without
// "type": "module"), so load it as a data: URL module.
const source = await readFile(new URL('./resume.js', import.meta.url), 'utf8');
const { determineResumeStep } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

const base = {
  location_city: 'San Jose, CA',
  partner_prefs_confirmed: 1,
  availability_window_start: '2026-11-01',
  availability_window_end: '2026-11-05',
};
const stepOf = (profile) => {
  const { flow, stepIndex } = determineResumeStep(profile);
  return flow[stepIndex];
};

test('no profile starts at the first step', () => {
  assert.equal(stepOf(null), 'quickProfile');
});

test('an org lead with no causes resumes on the causes step', () => {
  assert.equal(stepOf({ ...base, prospective_org_name: 'Some Org', cause_tags: '[]' }), 'causes');
});

test('an org lead with two causes continues past causes', () => {
  assert.equal(stepOf({ ...base, prospective_org_name: 'Some Org', cause_tags: '["Animal welfare","Elder care"]' }), 'done');
});

test('the cause path is unchanged', () => {
  assert.equal(stepOf({ location_city: 'San Jose, CA', cause_tags: '[]' }), 'orgOrCause');
  assert.equal(stepOf({ location_city: 'San Jose, CA', cause_tags: '["Animal welfare","Elder care"]' }), 'partnerPrefs');
  assert.equal(stepOf({ ...base, cause_tags: '["Animal welfare","Elder care"]', availability_window_end: null }), 'availability');
});

test('an org lead with one cause still resumes on causes', () => {
  assert.equal(stepOf({ ...base, prospective_org_name: 'Some Org', cause_tags: '["Animal welfare"]' }), 'causes');
});

test('an org lead is resumed on the org flow', () => {
  const { flow } = determineResumeStep({ ...base, prospective_org_name: 'Some Org', cause_tags: '[]' });
  assert.ok(flow.includes('causes'));
});

test('only one availability date set resumes on availability', () => {
  const causes = '["Animal welfare","Elder care"]';
  assert.equal(stepOf({ ...base, cause_tags: causes, availability_window_end: null }), 'availability');
  assert.equal(stepOf({ ...base, cause_tags: causes, availability_window_start: null }), 'availability');
});

test('malformed or non-array cause tags count as none', () => {
  assert.equal(stepOf({ location_city: 'San Jose, CA', cause_tags: 'not json' }), 'orgOrCause');
  assert.equal(stepOf({ location_city: 'San Jose, CA', cause_tags: '{"a":1}' }), 'orgOrCause');
  assert.equal(stepOf({ location_city: 'San Jose, CA', cause_tags: null }), 'orgOrCause');
});

test('coordinates alone count as a saved location', () => {
  assert.equal(stepOf({ location_lat: 37.3, location_lng: -121.9, cause_tags: '[]' }), 'orgOrCause');
  assert.equal(stepOf({ location_lat: 37.3, cause_tags: '[]' }), 'location');
});

test('an empty profile resumes on location', () => {
  assert.equal(stepOf({ cause_tags: '[]' }), 'location');
});

test('partner preferences unconfirmed resume on partnerPrefs even with availability set', () => {
  assert.equal(stepOf({ ...base, partner_prefs_confirmed: 0, cause_tags: '["Animal welfare","Elder care"]' }), 'partnerPrefs');
});
