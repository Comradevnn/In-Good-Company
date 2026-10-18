// node --test mobile/verification/localChecks.test.mjs — pure logic, no app runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// localChecks.js is written for Metro (ESM syntax in a .js file without
// "type": "module"), so load it as a data: URL module.
const source = await readFile(new URL('./localChecks.js', import.meta.url), 'utf8');
const checks = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const { nameMatches, dobMatchesAge, dobIsAdult, expiryIsValid, MIN_ADULT_AGE } = checks;

// A fixed "now" so every date assertion is deterministic.
const NOW = new Date('2026-06-15T12:00:00Z');
// Birth dates relative to NOW, built from the module's own minimum age.
const turnedAdultToday = `${2026 - MIN_ADULT_AGE}-06-15`;
const turnsAdultTomorrow = `${2026 - MIN_ADULT_AGE}-06-16`;

test('name order does not matter', () => {
  assert.equal(nameMatches('Jane Doe', 'DOE JANE MARIE'), true);
  assert.equal(nameMatches('Jane Marie Doe', 'Doe, Jane Marie'), true);
});

test('names tolerate short-form variants but not initials or other people', () => {
  assert.equal(nameMatches('Jon', 'Jonathan Smith'), true);
  assert.equal(nameMatches('J Smith', 'Jonathan Smith'), false);
  assert.equal(nameMatches('Jane', 'Janet Doe'), true);
  assert.equal(nameMatches('Alex', 'Jordan Smith'), false);
});

test('punctuation in printed names is tolerated', () => {
  assert.equal(nameMatches("Mary O'Brien", 'OBRIEN MARY-JANE'), true);
  assert.equal(nameMatches('Mary-Jane Smith', 'SMITH,MARY JANE'), true);
});

test('a surname-first printed name with no comma still matches', () => {
  assert.equal(nameMatches('Jordan Smith', 'SMITH JORDAN MICHAEL'), true);
  assert.equal(nameMatches('Jordan', 'SMITH JORDAN MICHAEL'), true);
  assert.equal(nameMatches('Jordan Smith', 'SMITH JAMES MICHAEL'), false);
});

test('empty names never match', () => {
  assert.equal(nameMatches('', 'Jane Doe'), false);
  assert.equal(nameMatches('Jane', '   '), false);
  assert.equal(nameMatches(null, undefined), false);
});

test('a name does not reuse one ID token for two profile tokens', () => {
  assert.equal(nameMatches('Jane Jane', 'Jane Doe'), false);
});

test('local checks never parse or require a document-number shape', () => {
  // Document numbers (including non-US shapes) are sent to the server as typed
  // and never interpreted on the device; guard against a parser sneaking in.
  assert.deepEqual(Object.keys(checks).sort(), [
    'MIN_ADULT_AGE', 'dobIsAdult', 'dobMatchesAge', 'expiryIsValid', 'nameMatches',
  ]);
});

test('expiry: today and yesterday are invalid, tomorrow is valid', () => {
  assert.equal(expiryIsValid('2026-06-15', NOW), false);
  assert.equal(expiryIsValid('2026-06-14', NOW), false);
  assert.equal(expiryIsValid('2026-06-16', NOW), true);
});

test('expiry: malformed or impossible dates are invalid', () => {
  assert.equal(expiryIsValid('06/16/2026', NOW), false);
  assert.equal(expiryIsValid('2030-02-31', NOW), false);
  assert.equal(expiryIsValid('', NOW), false);
  assert.equal(expiryIsValid(undefined, NOW), false);
});

test('dobMatchesAge tolerates a typed age that is off by one year', () => {
  // Born 2000-01-01 -> 26 on the fixed "now".
  assert.equal(dobMatchesAge('2000-01-01', 26, NOW), true);
  assert.equal(dobMatchesAge('2000-01-01', 25, NOW), true);
  assert.equal(dobMatchesAge('2000-01-01', 27, NOW), true);
  assert.equal(dobMatchesAge('2000-01-01', 28, NOW), false);
  assert.equal(dobMatchesAge('2000-01-01', 24, NOW), false);
});

test('dobMatchesAge rejects malformed, impossible and future dates', () => {
  assert.equal(dobMatchesAge('2000-1-1', 26, NOW), false);
  assert.equal(dobMatchesAge('2000-02-31', 26, NOW), false);
  assert.equal(dobMatchesAge('2030-01-01', 0, NOW), false);
  assert.equal(dobMatchesAge(undefined, 26, NOW), false);
});

test('exactly 18 today is an adult', () => {
  assert.equal(dobIsAdult(turnedAdultToday, NOW), true);
});

test('one day short of 18 is a minor (17 years 364 days)', () => {
  assert.equal(dobIsAdult(turnsAdultTomorrow, NOW), false);
});

test('a 17-year-old passes the age-tolerance check but fails the adult check', () => {
  // Typed age is the minimum, ID shows one day under: the lenient check lets it through, the strict one must not.
  const dob = turnsAdultTomorrow; // one day short of the minimum age
  assert.equal(dobMatchesAge(dob, MIN_ADULT_AGE, NOW), true);
  assert.equal(dobIsAdult(dob, NOW), false);
});

test('adult check handles older adults, leap-day births and bad input', () => {
  assert.equal(dobIsAdult('1980-12-31', NOW), true);
  assert.equal(dobIsAdult('2008-02-29', NOW), true); // leap-day birth, 18 by June
  assert.equal(dobIsAdult('2000-02-29', NOW), true);
  assert.equal(dobIsAdult('2000-02-31', NOW), false);
  assert.equal(dobIsAdult('2030-01-01', NOW), false);
  assert.equal(dobIsAdult('', NOW), false);
  assert.equal(dobIsAdult(null, NOW), false);
});

test('adult check uses a Feb 29 birthday on a non-leap year correctly', () => {
  // Born 2008-02-29; on 2026-02-28 they are still 17, on 2026-03-01 they are 18.
  assert.equal(dobIsAdult('2008-02-29', new Date('2026-02-28T12:00:00Z')), false);
  assert.equal(dobIsAdult('2008-02-29', new Date('2026-03-01T12:00:00Z')), true);
});
