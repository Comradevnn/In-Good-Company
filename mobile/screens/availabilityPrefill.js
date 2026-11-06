import { formatDate, parseDate } from './dates';

// Pure helpers for the availability screen and the calendar on it: what to pre-fill from a saved
// profile, how weekdays are read and described, and how a tap on a calendar day changes the range.
// Weekday numbers match the backend: 0 = Sunday .. 6 = Saturday; an empty list means any day.

export const FREQUENCY_OPTIONS = ['Once a month', 'Twice a month', 'Three times a month', 'Weekly'];
export const DEFAULT_RADIUS = 8;
export const DEFAULT_FREQUENCY = FREQUENCY_OPTIONS[1];
const DEFAULT_SPAN_DAYS = 5;
export const CALENDAR_DAYS = 62; // the most days the calendar route answers for

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Monday-first display order, as day numbers.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const NO_WEEKDAY_MESSAGE = 'None of the days you picked fall between your start and end dates';

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// A saved date string -> Date, or null when missing or not a real YYYY-MM-DD day.
function readDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) || formatDate(date) !== value ? null : date;
}

// availability_weekdays arrives as JSON text (or an array, or null). Anything unreadable means "any day".
export function parseWeekdays(value) {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const days = list.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

// "Any day, soonest first", or e.g. "Fridays, Saturdays and Sundays" (in week order, Monday first).
export function weekdaysSummary(weekdays) {
  const days = parseWeekdays(weekdays);
  if (!days.length) return 'Any day, soonest first';
  const names = WEEK_ORDER.filter((d) => days.includes(d)).map((d) => `${WEEKDAY_NAMES[d]}s`);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// True when no weekday is chosen, or at least one chosen weekday falls between start and end (inclusive).
export function hasWeekdayInRange(weekdays, start, end) {
  if (!weekdays.length) return true;
  const last = parseDate(end);
  for (let d = parseDate(start); d <= last; d = addDays(d, 1)) {
    if (weekdays.includes(d.getDay())) return true;
  }
  return false;
}

// Everything the screen starts from. `today` is a Date at local midnight. Saved dates that have
// passed are not useful defaults: start from today instead and flag it so the screen can say so.
export function computePrefill(initial, today) {
  const savedStart = readDate(initial?.availability_window_start);
  const savedEnd = readDate(initial?.availability_window_end);
  const savedPassed = Boolean((savedStart && savedStart < today) || (savedEnd && savedEnd < today));
  // With only a start saved, default the end relative to that start so it can't land before it.
  const start = savedPassed ? today : savedStart ?? today;
  let end = savedPassed ? addDays(today, DEFAULT_SPAN_DAYS) : savedEnd ?? addDays(start, DEFAULT_SPAN_DAYS);
  if (end < start) end = start;
  const radius = Number(initial?.travel_radius_miles);
  return {
    start: formatDate(start),
    end: formatDate(end),
    savedPassed,
    radius: Number.isFinite(radius) && radius >= 1 ? radius : DEFAULT_RADIUS,
    frequency: FREQUENCY_OPTIONS.includes(initial?.volunteering_frequency) ? initial.volunteering_frequency : DEFAULT_FREQUENCY,
    weekdays: parseWeekdays(initial?.availability_weekdays),
  };
}

// Toggling one weekday in the chosen list; the result is sorted, and empty means "any day".
export function toggleWeekday(weekdays, day) {
  const next = weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day];
  return next.sort((a, b) => a - b);
}

// A calendar tap. phase 'start': the tap becomes both start and end and the next tap picks the end.
// phase 'end': a tap on or after the start sets the end and finishes; an earlier tap moves the start.
// A tap after that starts over. Dates are YYYY-MM-DD, which compare correctly as text.
export function pickDay(state, day) {
  if (state.phase === 'end' && day >= state.start) return { start: state.start, end: day, phase: 'start' };
  return { start: day, end: day, phase: 'end' };
}

// Weeks (Monday first) of a month as YYYY-MM-DD strings, with null padding outside the month.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null)];
  for (let d = 1; d <= count; d += 1) cells.push(formatDate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthTitle(year, month) {
  return `${MONTH_NAMES[month]} ${year}`;
}

// "Friday 14 November"
export function dayLabel(day) {
  const d = parseDate(day);
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}
