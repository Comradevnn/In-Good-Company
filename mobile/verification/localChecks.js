// On-device verification checks (spec points 6-7 in
// specs/identity-verification-encryption-spec.md). Everything here runs
// before anything leaves the device. PROTOTYPE NOTE: the "extracted" values
// these compare against are manually typed (no scanning SDK yet), so a pass
// asserts flow-completion, not identity — which is why the issued badge says
// "Verified (preview)".

// Name matching per test cases V1 + V15: order-independent (sorted token
// set, so "DOE JANE MARIE" matches "Jane Marie Doe"), tolerant of minor
// variants (prefix match, so "Jon" matches "Jonathan"), and subset-safe
// (the profile only stores a first name, the ID prints a full name).
function normalizeTokens(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/['.’]/g, '') // apostrophes/periods join: O'BRIEN -> OBRIEN
    .replace(/[,\-]/g, ' ') // hyphens/commas split: MARY-JANE -> MARY JANE
    .split(/\s+/)
    .filter(Boolean);
}

function tokensMatch(a, b) {
  if (a === b) return true;
  // Minor-variant tolerance (V1: "Jon" ~ "Jonathan"): prefix of at least 3
  // chars, so initials alone never count as a match.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 3 && longer.startsWith(shorter);
}

export function nameMatches(profileName, idName) {
  const profileTokens = normalizeTokens(profileName);
  const idTokens = normalizeTokens(idName);
  if (profileTokens.length === 0 || idTokens.length === 0) return false;

  // Every profile token must match a distinct ID token, in any order (V15).
  const available = [...idTokens];
  for (const token of profileTokens) {
    const index = available.findIndex((candidate) => tokensMatch(token, candidate));
    if (index === -1) return false;
    available.splice(index, 1);
  }
  return true;
}

// Minimum age to use the app. The backend's lib/rules.js MIN_AGE is the source
// of truth; this is a local copy only so the device can refuse early (the
// mobile app has no access to rules.js). Keep the two in step.
export const MIN_ADULT_AGE = 18;

// Strict YYYY-MM-DD parse (rejects impossible dates like 2000-02-31).
function parseIsoDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString ?? '')) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== dateString) return null;
  return date;
}

// Whole years elapsed since the date of birth, as of `now` (UTC calendar
// days). Null when the DOB is not a real date or lies in the future.
function ageOnDate(dobString, now) {
  const dob = parseIsoDate(dobString);
  if (!dob) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const hadBirthdayThisYear =
    now.getUTCMonth() > dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() >= dob.getUTCDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age < 0 ? null : age;
}

// The profile stores age (an integer), not DOB, so "DOB match" at prototype
// stage is an age-consistency check: the age implied by the typed DOB must
// equal the profile age, ±1 year since the profile age may have been typed
// months before verification. This tolerance is for typos in the typed age
// ONLY — it must never be used to decide adulthood (see dobIsAdult).
// `now` is injectable so tests are deterministic.
export function dobMatchesAge(dobString, profileAge, now = new Date()) {
  const age = ageOnDate(dobString, now);
  if (age === null) return false;
  return Math.abs(age - Number(profileAge)) <= 1;
}

// Strict adult check on the document's own date of birth, independent of the
// self-reported profile age: someone one day short of their 18th birthday is
// a minor. Only this boolean is sent to the server; the DOB never leaves the
// device.
export function dobIsAdult(dobString, now = new Date()) {
  const age = ageOnDate(dobString, now);
  return age !== null && age >= MIN_ADULT_AGE;
}

// V3 (local half): expiry must be a valid future date. The server re-checks
// this independently — never trust only the client.
export function expiryIsValid(expiryString, now = new Date()) {
  if (!parseIsoDate(expiryString)) return false;
  return expiryString > now.toISOString().slice(0, 10);
}
