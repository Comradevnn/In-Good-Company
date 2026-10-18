// Lightweight reliability signal: on-time cancels, late cancels and
// no-shows are logged per user and folded into users.reliability_score and
// the habitual-late-canceller flag. Neither is ever returned to another
// user; the owner only sees the consequence (a reminder, a matching pause,
// or an account review), never the score itself.
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const { notify } = require('./notify');

function record(userId, kind, bookingId) {
  db.prepare('INSERT INTO reliability_events (user_id, kind, booking_id, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, kind, bookingId ?? null, clock.isoNow());
  recompute(userId);
  if (kind === 'no_show') escalate(userId);
}

function recompute(userId) {
  const counts = Object.fromEntries(db.prepare(`
    SELECT kind, COUNT(*) AS n FROM reliability_events WHERE user_id = ? GROUP BY kind
  `).all(userId).map((r) => [r.kind, r.n]));
  const attended = counts.attended ?? 0;
  const late = counts.late_cancel ?? 0;
  const noShow = counts.no_show ?? 0;
  const total = attended + late + noShow;
  // On-time (grace / free) cancels are logged but don't lower the score.
  const score = total === 0 ? null : Math.round((100 * (attended + 0.5 * late)) / total);
  const recentLate = db.prepare(`
    SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ? AND kind = 'late_cancel' AND created_at > ?
  `).get(userId, new Date(clock.nowMs() - rules.NO_SHOW_WINDOW_MS).toISOString()).n;
  db.prepare(`
    UPDATE users SET reliability_score = ?, reliability_flag_habitual_late_canceller = ?,
      reliability_flag_notably_nervous_or_first_time = ?
    WHERE id = ?
  `).run(score, recentLate >= 2 ? 1 : 0, attended === 0 ? 1 : 0, userId);
}

// Escalating response to repeat no-shows: reminder, then a temporary
// matching pause, then account review (matching blocked until cleared).
function escalate(userId) {
  const recent = db.prepare(`
    SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ? AND kind = 'no_show' AND created_at > ?
  `).get(userId, new Date(clock.nowMs() - rules.NO_SHOW_WINDOW_MS).toISOString()).n;
  if (recent >= rules.NO_SHOW_REVIEW_AT) {
    db.prepare('UPDATE users SET account_review = 1 WHERE id = ?').run(userId);
    notify(userId, 'reliability_review', 'Your account is under review',
      "You've missed several shifts recently. Matching is paused while a person from our team reviews your account.");
  } else if (recent >= rules.NO_SHOW_PAUSE_AT) {
    const until = new Date(clock.nowMs() + rules.NO_SHOW_PAUSE_MS).toISOString();
    db.prepare('UPDATE users SET matching_paused_until = ? WHERE id = ?').run(until, userId);
    notify(userId, 'reliability_pause', 'Matching is paused for now',
      "You've missed more than one shift without notice, so we've paused new matches for two weeks. Orgs and partners count on people showing up.");
  } else {
    notify(userId, 'reliability_reminder', 'We missed you at your shift',
      "Your shift was marked as a no-show. If plans change, cancelling ahead of time helps the org and your partner.");
  }
}

// Why (if at all) this user is currently blocked from matching.
function matchingBlock(user, nowMs = clock.nowMs()) {
  if (user.account_review) return { code: 'account_review' };
  if (user.matching_paused_until && clock.parseTime(user.matching_paused_until) > nowMs) {
    return { code: 'matching_paused', until: user.matching_paused_until };
  }
  return null;
}

module.exports = { record, recompute, matchingBlock };
