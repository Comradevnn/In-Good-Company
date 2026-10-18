// The server's notion of "now". Every lifecycle decision (grace windows,
// proposal expiry, waiting caps, trial length, weekly grants, shift day)
// reads time through here, so a dev-only offset can fast-forward the whole
// app without waiting days. The offset lives in this process's memory only
// — it never touches the database, so advancing a test server's clock can't
// shift time for the developer's own long-running server on another port.
let offsetMs = 0;

function nowMs() {
  return Date.now() + offsetMs;
}

function now() {
  return new Date(nowMs());
}

function isoNow() {
  return now().toISOString();
}

function advance(ms) {
  offsetMs += ms;
}

function reset() {
  offsetMs = 0;
}

function offset() {
  return offsetMs;
}

// Parses either an ISO string written by this module or SQLite's
// datetime('now') format ("YYYY-MM-DD HH:MM:SS", UTC) into epoch ms.
function parseTime(value) {
  if (!value) return null;
  if (value.includes('T')) return Date.parse(value);
  return Date.parse(`${value.replace(' ', 'T')}Z`);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

module.exports = { now, nowMs, isoNow, advance, reset, offset, parseTime, HOUR, DAY };
