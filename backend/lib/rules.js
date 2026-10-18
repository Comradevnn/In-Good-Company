// Product rules in one place. The values implement the private master spec
// (see README "Specs"); this file deliberately carries no rationale — the
// spec is the source of truth, and changing a number here should follow a
// spec change, not the other way round.
const { HOUR, DAY } = require('./clock');

module.exports = {
  PLATFORM_TIMEZONE: 'America/Los_Angeles',

  // Deeds
  DEFAULT_SHIFT_PRICE_DEEDS: 5,
  PURCHASE_PACKS: [5, 25, 50],
  CENTS_PER_DEED: 100,
  ORG_SHARE_OF_PURCHASED_PCT: 80, // remainder is platform revenue
  ORG_SHARE_OF_FREE_PCT: 100,

  // Holds and cancellation
  GRACE_WINDOW_MS: 1 * HOUR,
  BACKOUT_CUTOFF_MS: 12 * HOUR,
  BAIL_DECISION_MS: 8 * HOUR,
  BAIL_MIN_TIME_BEFORE_SHIFT_MS: 3 * HOUR,
  REMATCH_LAST_PROPOSAL_BEFORE_SHIFT_MS: 2 * HOUR,

  // Matching and waiting
  MIN_LEAD_MS: 24 * HOUR,
  PROPOSAL_RESPONSE_MS: 24 * HOUR,
  PROPOSAL_LAST_RESPONSE_BEFORE_SHIFT_MS: 12 * HOUR,
  WAIT_SOFT_MS: 3 * DAY,
  WAIT_CAP_MS: 5 * DAY,

  // Tiers
  FREE_MONTHLY_CAP: 2,
  PREMIUM_MONTHLY_CAP: 15,
  FREE_BUDDY_CAP: 1,
  PREMIUM_BUDDY_CAP: 2,
  TRIAL_MS: 14 * DAY,
  PREMIUM_WEEKLY_GRANT: 2,
  PREMIUM_GRANT_INTERVAL_MS: 7 * DAY,
  PREMIUM_PLANS: {
    monthly: { price_cents: 1299, months: 1 },
    annual: { price_cents: 10900, months: 12 },
  },
  PREMIUM_FREE_LATE_CANCELS_PER_MONTH: 1,

  // Referrals
  REFERRAL_DEEDS: 1,
  REFERRAL_COOLDOWN_MS: 7 * DAY,

  // Shift day
  STARTERS_PER_SHIFT: 3,
  // A shift counts as "daytime" when it starts and ends within these local
  // hours of its own timezone (shown as a tag; not a matching input).
  DAYTIME_START_HOUR: 7,
  DAYTIME_END_HOUR: 19,
  ATTENDANCE_AUTO_RESOLVE_MS: 24 * HOUR,

  // Reliability escalation (no-shows counted over a trailing window)
  NO_SHOW_WINDOW_MS: 90 * DAY,
  NO_SHOW_PAUSE_AT: 2,
  NO_SHOW_REVIEW_AT: 3,
  // Owner decision: open safety reports from this many different past partners
  // pause the reported person's matching until staff review it.
  SAFETY_PAUSE_DISTINCT_REPORTERS: 2,
  NO_SHOW_PAUSE_MS: 14 * DAY,

  MIN_AGE: 18,

  // Resurfacing nudges (notifications only; never a matching input).
  // Proposed default, owner to confirm: how many days of quiet (no shift, no
  // search, no earlier nudge) before a user is told about new shifts that
  // fit them, keyed by the volunteering_frequency label chosen at onboarding.
  RESURFACE_CADENCE_DAYS: {
    'Weekly': 7,
    'Three times a month': 10,
    'Twice a month': 14,
    'Once a month': 30,
  },
  // Proposed default, owner to confirm: how far ahead the nudge looks for
  // shifts that fit.
  RESURFACE_HORIZON_MS: 14 * DAY,
};
