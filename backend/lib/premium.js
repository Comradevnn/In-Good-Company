// Premium tier: the signup trial, mock subscriptions, the weekly Deeds
// grant, the monthly matched-shift cap, buddy slots and the monthly
// penalty-free late cancellation. Tier only ever feeds pass/fail limits —
// it is never an input to matching order (see lib/matchingRunner.js).
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const deeds = require('./deeds');
const { monthKey } = require('./time');

function accountFor(user) {
  return db.prepare('SELECT created_at FROM accounts WHERE id = ?').get(user.account_id);
}

function trialEndsAtMs(user) {
  const account = accountFor(user);
  const start = clock.parseTime(account?.created_at ?? user.created_at);
  return start + rules.TRIAL_MS;
}

function subscriptionActiveAt(userId, atMs) {
  return Boolean(db.prepare(`
    SELECT 1 FROM premium_subscriptions WHERE user_id = ? AND period_start <= ? AND period_end > ?
  `).get(userId, new Date(atMs).toISOString(), new Date(atMs).toISOString()));
}

function premiumActiveAt(user, atMs) {
  return atMs < trialEndsAtMs(user) || subscriptionActiveAt(user.id, atMs);
}

function state(user, atMs = clock.nowMs()) {
  const trialEnds = trialEndsAtMs(user);
  const inTrial = atMs < trialEnds;
  const subscribed = subscriptionActiveAt(user.id, atMs);
  const tier = inTrial || subscribed ? 'premium' : 'free';
  return {
    tier,
    source: subscribed ? 'subscription' : inTrial ? 'trial' : null,
    trial_ends_at: new Date(trialEnds).toISOString(),
    premium_until: user.premium_until,
    plan: user.premium_plan,
    monthly_cap: tier === 'premium' ? rules.PREMIUM_MONTHLY_CAP : rules.FREE_MONTHLY_CAP,
    buddy_cap: tier === 'premium' ? rules.PREMIUM_BUDDY_CAP : rules.FREE_BUDDY_CAP,
  };
}

// Matched shifts that count toward this calendar month's cap: paired
// bookings confirmed this month and not since released at no cost.
function capUsed(userId, atMs = clock.nowMs()) {
  return db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND cap_month = ?')
    .get(userId, monthKey(new Date(atMs))).n;
}

// Open proposals not yet confirmed also reserve a place under the cap, so a
// user can't be proposed more shifts than they'd be allowed to confirm.
function capPending(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM bookings b JOIN pairings p ON p.id = b.pairing_id
    WHERE b.user_id = ? AND b.status = 'proposed' AND p.status = 'proposed'
  `).get(userId).n;
}

function capStatus(user, atMs = clock.nowMs()) {
  const s = state(user, atMs);
  const used = capUsed(user.id, atMs);
  return { cap: s.monthly_cap, used, pending: capPending(user.id), reached: used >= s.monthly_cap };
}

function freeLateCancelAvailable(user, atMs = clock.nowMs()) {
  if (state(user, atMs).tier !== 'premium') return false;
  const used = db.prepare(`
    SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND cancel_type = 'free_late' AND substr(cancelled_at, 1, 7) = ?
  `).get(user.id, monthKey(new Date(atMs))).n;
  // cancelled_at is stored UTC; month boundaries in the platform timezone can
  // differ by a few hours from the UTC prefix — acceptable for a prototype.
  return used < rules.PREMIUM_FREE_LATE_CANCELS_PER_MONTH;
}

// Weekly grant, applied lazily: every grant that came due while the user was
// Premium (trial included) is credited, once, in order. The first grant is
// due when Premium starts.
const applyGrants = db.transaction((user, atMs = clock.nowMs()) => {
  let nextMs = user.premium_grant_next_at ? clock.parseTime(user.premium_grant_next_at) : null;
  if (nextMs == null) {
    if (!premiumActiveAt(user, atMs)) return 0;
    // Start of the current Premium stretch: the trial start, or now for a
    // subscription (a subscription start is always <= now when we get here).
    const trialStart = trialEndsAtMs(user) - rules.TRIAL_MS;
    nextMs = atMs < trialEndsAtMs(user) ? trialStart : atMs;
  }
  let granted = 0;
  while (nextMs <= atMs) {
    if (!premiumActiveAt(user, nextMs)) {
      nextMs = null;
      break;
    }
    deeds.credit(user.id, 'free', rules.PREMIUM_WEEKLY_GRANT, 'premium_grant', { due_at: new Date(nextMs).toISOString() });
    granted++;
    nextMs += rules.PREMIUM_GRANT_INTERVAL_MS;
  }
  db.prepare('UPDATE users SET premium_grant_next_at = ? WHERE id = ?')
    .run(nextMs == null ? null : new Date(nextMs).toISOString(), user.id);
  return granted;
});

// Mock subscription: no processor, no card. Paid time starts when the
// current Premium (trial or earlier subscription) runs out.
function subscribe(user, plan) {
  const config = rules.PREMIUM_PLANS[plan];
  if (!config) throw new deeds.DeedsError('invalid_plan', "plan must be 'monthly' or 'annual'.");
  const nowMs = clock.nowMs();
  const lastEnd = db.prepare('SELECT MAX(period_end) AS e FROM premium_subscriptions WHERE user_id = ?').get(user.id).e;
  const startMs = Math.max(nowMs, trialEndsAtMs(user), lastEnd ? clock.parseTime(lastEnd) : 0);
  const start = new Date(startMs);
  const end = new Date(startMs);
  end.setUTCMonth(end.getUTCMonth() + config.months);
  db.prepare(`
    INSERT INTO premium_subscriptions (user_id, plan, price_cents, period_start, period_end, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user.id, plan, config.price_cents, start.toISOString(), end.toISOString(), clock.isoNow());
  db.prepare('UPDATE users SET premium_until = ?, premium_plan = ? WHERE id = ?').run(end.toISOString(), plan, user.id);
  return { period_start: start.toISOString(), period_end: end.toISOString(), price_cents: config.price_cents };
}

module.exports = { state, capStatus, capUsed, capPending, freeLateCancelAvailable, applyGrants, subscribe, premiumActiveAt, trialEndsAtMs };
