// node --test screens/availabilityPrefill.test.mjs (from mobile/) — pure logic, no app runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// The modules are written for Metro (ESM in .js), so copy them to a temp dir as .mjs first.
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'availability-'));
for (const name of ['dates', 'availabilityPrefill']) {
  const src = fs.readFileSync(path.join(here, `${name}.js`), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(dir, `${name}.mjs`), src);
}
const m = await import(pathToFileURL(path.join(dir, 'availabilityPrefill.mjs')).href);
fs.rmSync(dir, { recursive: true, force: true });

const today = new Date(2026, 10, 6); // Friday 6 November 2026

test('resuming with everything saved pre-fills dates, radius, frequency and weekdays', () => {
  const p = m.computePrefill({
    availability_window_start: '2026-11-10', availability_window_end: '2026-11-20',
    travel_radius_miles: 12, volunteering_frequency: 'Weekly', availability_weekdays: '[5,6,0]',
  }, today);
  assert.deepEqual(p, { start: '2026-11-10', end: '2026-11-20', savedPassed: false, radius: 12, frequency: 'Weekly', weekdays: [0, 5, 6] });
});

test('resuming with only some fields set fills the rest with defaults', () => {
  const onlyStart = m.computePrefill({ availability_window_start: '2026-11-10' }, today);
  assert.equal(onlyStart.start, '2026-11-10');
  assert.equal(onlyStart.end, '2026-11-15');
  assert.equal(onlyStart.radius, m.DEFAULT_RADIUS);
  assert.equal(onlyStart.frequency, m.DEFAULT_FREQUENCY);
  assert.deepEqual(onlyStart.weekdays, []);
  const nothing = m.computePrefill(null, today);
  assert.equal(nothing.start, '2026-11-06');
  assert.equal(nothing.end, '2026-11-11');
  const radiusOnly = m.computePrefill({ travel_radius_miles: 3 }, today);
  assert.equal(radiusOnly.radius, 3);
  assert.equal(radiusOnly.frequency, m.DEFAULT_FREQUENCY);
});

test('saved dates that have passed fall back to today and say so', () => {
  const p = m.computePrefill({ availability_window_start: '2026-10-01', availability_window_end: '2026-10-09', availability_weekdays: '[1]' }, today);
  assert.equal(p.savedPassed, true);
  assert.equal(p.start, '2026-11-06');
  assert.equal(p.end, '2026-11-11');
  assert.deepEqual(p.weekdays, [1]);
});

test('an end saved before its start is pulled up to the start', () => {
  const p = m.computePrefill({ availability_window_start: '2026-11-12', availability_window_end: '2026-11-09' }, today);
  assert.equal(p.end, '2026-11-12');
});

test('malformed weekdays or dates read as "any day" or unset, never throw', () => {
  for (const bad of ['{nope', '"Fri"', '{"a":1}', 'null', '', 7, undefined, null]) {
    assert.deepEqual(m.parseWeekdays(bad), [], String(bad));
  }
  assert.deepEqual(m.parseWeekdays('[1,1,"x",9,-1,2.5,3]'), [1, 3]);
  assert.deepEqual(m.parseWeekdays([6, 0]), [0, 6]);
  const p = m.computePrefill({ availability_window_start: 'soon', availability_window_end: '2026-02-31', availability_weekdays: '{oops' }, today);
  assert.equal(p.start, '2026-11-06');
  assert.deepEqual(p.weekdays, []);
});

test('weekday summary names days in week order, Monday first', () => {
  assert.equal(m.weekdaysSummary(null), 'Any day, soonest first');
  assert.equal(m.weekdaysSummary('[]'), 'Any day, soonest first');
  assert.equal(m.weekdaysSummary('[0]'), 'Sundays');
  assert.equal(m.weekdaysSummary('[0,6,5]'), 'Fridays, Saturdays and Sundays');
  assert.equal(m.weekdaysSummary([2, 4]), 'Tuesdays and Thursdays');
});

test('weekday check: a chosen day must fall inside the dates', () => {
  assert.equal(m.hasWeekdayInRange([], '2026-11-09', '2026-11-09'), true);
  assert.equal(m.hasWeekdayInRange([5], '2026-11-09', '2026-11-13'), true); // Mon to Fri
  assert.equal(m.hasWeekdayInRange([6, 0], '2026-11-09', '2026-11-13'), false); // Mon to Fri, weekend only
  assert.equal(m.hasWeekdayInRange([1], '2026-11-09', '2026-11-09'), true);
});

test('toggling weekdays keeps them sorted and empty means any day', () => {
  let days = m.toggleWeekday([], 6);
  days = m.toggleWeekday(days, 1);
  assert.deepEqual(days, [1, 6]);
  assert.deepEqual(m.toggleWeekday(m.toggleWeekday(days, 1), 6), []);
});

test('calendar taps: start, then end, then start over', () => {
  let s = { start: '2026-11-10', end: '2026-11-12', phase: 'start' };
  s = m.pickDay(s, '2026-11-15');
  assert.deepEqual(s, { start: '2026-11-15', end: '2026-11-15', phase: 'end' });
  s = m.pickDay(s, '2026-11-20');
  assert.deepEqual(s, { start: '2026-11-15', end: '2026-11-20', phase: 'start' });
  s = m.pickDay(s, '2026-11-08');
  assert.deepEqual(s, { start: '2026-11-08', end: '2026-11-08', phase: 'end' });
  s = m.pickDay(s, '2026-11-08'); // the same day twice is a one-day range
  assert.deepEqual(s, { start: '2026-11-08', end: '2026-11-08', phase: 'start' });
  s = m.pickDay({ start: '2026-11-15', end: '2026-11-15', phase: 'end' }, '2026-11-12'); // earlier than the start moves the start
  assert.deepEqual(s, { start: '2026-11-12', end: '2026-11-12', phase: 'end' });
});

test('month grid is Monday first, padded with nulls, whole weeks', () => {
  const weeks = m.monthGrid(2026, 10); // November 2026 starts on a Sunday
  assert.ok(weeks.every((w) => w.length === 7));
  assert.deepEqual(weeks[0].slice(0, 6), [null, null, null, null, null, null]);
  assert.equal(weeks[0][6], '2026-11-01');
  assert.equal(weeks.flat().filter(Boolean).length, 30);
  assert.equal(m.monthGrid(2026, 8)[0][1], '2026-09-01'); // September 2026 starts on a Tuesday
});

test('labels read plainly', () => {
  assert.equal(m.dayLabel('2026-11-14'), 'Saturday 14 November');
  assert.equal(m.monthTitle(2026, 10), 'November 2026');
});
