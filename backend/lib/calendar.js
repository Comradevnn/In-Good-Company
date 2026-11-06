// The search calendar: one colour per day for the date picker. The colour is
// the only thing revealed about other people (never who or how many), so
// this returns dates and colours and nothing else.
const clock = require('./clock');
const rules = require('./rules');
const lifecycle = require('./lifecycle');
const { visibleShifts } = require('./shifts');
const { activeBookings, overlaps } = require('./matchingRunner');
const { passesShiftGate } = require('../matching/engine');
const { isRealDate, localDate, addDays } = require('./time');

const DAY_MS = 24 * 60 * 60 * 1000;

class CalendarError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 400;
  }
}

function daysBetween(fromYmd, toYmd) {
  const ms = (ymd) => Date.UTC(...ymd.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((ms(toYmd) - ms(fromYmd)) / DAY_MS);
}

// Resolves the query into the list of local days to colour (past days left
// out) or throws a CalendarError.
function resolveRange(query, nowMs) {
  const today = localDate(new Date(nowMs));
  const from = query.from ?? today;
  if (!isRealDate(from) || (query.to != null && !isRealDate(query.to))) {
    throw new CalendarError('invalid_range', 'from and to must be real dates (YYYY-MM-DD).');
  }
  const to = query.to ?? addDays(from, rules.CALENDAR_DEFAULT_SPAN_DAYS);
  if (to < from) throw new CalendarError('invalid_range', 'to must be on or after from.');
  if (daysBetween(from, to) + 1 > rules.CALENDAR_MAX_RANGE_DAYS) {
    throw new CalendarError('invalid_range', `Ask for at most ${rules.CALENDAR_MAX_RANGE_DAYS} days at a time.`);
  }
  const days = [];
  for (let day = from < today ? today : from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

function parseRadius(value) {
  if (value == null || value === '') return null;
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 100) {
    throw new CalendarError('invalid_radius', 'Travel distance must be between 1 and 100 miles.');
  }
  return radius;
}

// Colour for each requested day: 'red' nothing compatible, 'yellow' spots but
// nearly full or no partner likely yet, 'green' roomy spots and a likely partner.
function calendarFor(user, query = {}) {
  const nowMs = clock.nowMs();
  const days = resolveRange(query, nowMs);
  const radius = parseRadius(query.radius);
  if (days.length === 0) return { days: [] };

  const gateUser = { ...user, travel_radius_miles: radius ?? user.travel_radius_miles };
  const mine = activeBookings(user.id);
  const first = days[0];
  const last = days[days.length - 1];

  // Per local day: the open-spot counts of the shifts this person could take.
  const spotsByDay = new Map();
  for (const shift of visibleShifts(clock.isoNow())) {
    if (Date.parse(shift.starts_at) < nowMs + rules.MIN_LEAD_MS) continue;
    const day = localDate(new Date(shift.starts_at), shift.timezone);
    if (day < first || day > last) continue;
    if (shift.capacity_remaining < 2) continue; // a pair needs two spots
    if (overlaps(shift, mine)) continue;
    if (!passesShiftGate(gateUser, shift).pass) continue;
    if (!spotsByDay.has(day)) spotsByDay.set(day, []);
    spotsByDay.get(day).push(shift.capacity_remaining);
  }

  const open = lifecycle.openRequest(user.id);
  const request = radius != null ? { ...(open ?? {}), travel_radius_miles: radius } : open ?? null;
  return {
    days: days.map((date) => {
      const spots = spotsByDay.get(date);
      if (!spots) return { date, colour: 'red' };
      const roomy = spots.some((n) => n > rules.CALENDAR_NEARLY_FULL_SPOTS);
      const colour = roomy && lifecycle.anyonePartnerLikely(user, date, date, request) ? 'green' : 'yellow';
      return { date, colour };
    }),
  };
}

module.exports = { calendarFor, CalendarError };
