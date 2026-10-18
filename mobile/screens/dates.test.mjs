// node --test mobile/screens/dates.test.mjs — pure logic, no app runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./dates.js', import.meta.url), 'utf8');
const { formatDate, parseDate } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test('formatting uses local calendar fields, zero-padded', () => {
  assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(formatDate(new Date(2026, 11, 31)), '2026-12-31');
});

test('a local-midnight date formats to the same day regardless of timezone', () => {
  assert.equal(formatDate(new Date(2026, 2, 1, 0, 0, 0)), '2026-03-01');
  assert.equal(formatDate(new Date(2026, 2, 1, 23, 59, 59)), '2026-03-01');
});

test('parsing gives local midnight of that calendar day', () => {
  const d = parseDate('2026-11-05');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 0);
});

test('parse then format round-trips every day of a year, across month and leap boundaries', () => {
  for (let day = new Date(2024, 0, 1); day.getFullYear() < 2026; day.setDate(day.getDate() + 1)) {
    const text = formatDate(day);
    assert.equal(formatDate(parseDate(text)), text);
  }
  assert.equal(formatDate(parseDate('2024-02-29')), '2024-02-29');
});
