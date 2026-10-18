// Platform-timezone helpers. Shift times are stored as UTC instants; dates
// the user picks (availability windows) and calendar months (the monthly cap,
// org payouts) are interpreted in the platform's launch-market timezone.
const { PLATFORM_TIMEZONE } = require('./rules');

function parts(date, tz = PLATFORM_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

function tzOffsetMs(date, tz = PLATFORM_TIMEZONE) {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// "YYYY-MM-DD" + local wall-clock time in tz → UTC Date.
function zonedToUtc(ymd, hour, minute = 0, tz = PLATFORM_TIMEZONE) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

// True only for a real calendar day in YYYY-MM-DD form (no Feb 31, no
// month 13): the parts must survive a round trip through Date.UTC.
function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Minutes since local midnight in tz.
function localMinutes(date, tz = PLATFORM_TIMEZONE) {
  const p = parts(date, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

function localDate(date, tz = PLATFORM_TIMEZONE) {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function monthKey(date, tz = PLATFORM_TIMEZONE) {
  return localDate(date, tz).slice(0, 7);
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// End of a local calendar day (start of the next one), as epoch ms.
function endOfLocalDayMs(ymd, tz = PLATFORM_TIMEZONE) {
  return zonedToUtc(addDays(ymd, 1), 0, 0, tz).getTime();
}

// "Sat, Oct 24 · 9:00–11:30 AM" in the shift's own timezone.
function formatShiftWhen(startsAt, endsAt, tz = PLATFORM_TIMEZONE) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const time = (d) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day} · ${time(start).replace(/ (AM|PM)$/, (m) => (time(start).slice(-2) === time(end).slice(-2) ? '' : m))}–${time(end)}`;
}

function weekdayName(startsAt, tz = PLATFORM_TIMEZONE) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date(startsAt));
}

module.exports = { isRealDate, localMinutes, zonedToUtc, localDate, monthKey, addDays, endOfLocalDayMs, formatShiftWhen, weekdayName };
