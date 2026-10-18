// Small in-memory sliding-window rate limiter (single-process prototype; no
// dependency). RATE_LIMIT=off disables it, which the test harness does by
// default so suites aren't throttled by their own signups.
const windows = new Map(); // key -> [timestamps]

function enabled() {
  return process.env.RATE_LIMIT !== 'off';
}

// Records a hit for `key` and returns { ok, retryAfterSec }.
function hit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  windows.set(key, recent);
  if (recent.length <= limit) return { ok: true };
  return { ok: false, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
}

// Checks without recording (for "count only failures" limits).
function exceeded(key, limit, windowMs) {
  const now = Date.now();
  const recent = (windows.get(key) || []).filter((t) => now - t < windowMs);
  windows.set(key, recent);
  if (recent.length < limit) return null;
  return Math.ceil((recent[0] + windowMs - now) / 1000);
}

function record(key) {
  const list = windows.get(key) || [];
  list.push(Date.now());
  windows.set(key, list);
}

function tooMany(res, retryAfterSec) {
  res.set('Retry-After', String(Math.max(1, retryAfterSec)));
  return res.status(429).json({ code: 'rate_limited', error: 'Too many attempts. Please wait a few minutes and try again.' });
}

// Per-account limit for a named action (e.g. 'chat_message'). `rule` is
// { limit, windowMs } from rules.ABUSE_LIMITS. Counts every attempt, sends the
// 429 itself and returns true when the caller should stop.
function limitedFor(res, action, userId, rule) {
  if (!enabled()) return false;
  const result = hit(`${action}:${userId}`, rule.limit, rule.windowMs);
  if (result.ok) return false;
  tooMany(res, result.retryAfterSec);
  return true;
}

module.exports = { enabled, hit, exceeded, record, tooMany, limitedFor };
