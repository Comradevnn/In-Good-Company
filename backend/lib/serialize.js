// What a user's own profile responses may contain. The users row also holds
// internal state — who has safety-reported whom, the reliability signal and
// escalation flags, referral bookkeeping, the Premium grant cursor — that is
// never sent to any client, the owner included.
const INTERNAL_USER_COLUMNS = [
  'flagged_users',
  'flagged_by',
  'reliability_score',
  'reliability_flag_habitual_late_canceller',
  'reliability_flag_notably_nervous_or_first_time',
  'account_review',
  'review_reason',
  'matching_paused_until',
  'referred_by_user_id',
  'referral_credited_at',
  'premium_grant_next_at',
  'active_buddy_id',
  'buddy_requested_this_slot',
];

const SECRET_PATTERN = /(password|token|secret|hash|pepper)/i;

function ownProfile(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (INTERNAL_USER_COLUMNS.includes(key) || SECRET_PATTERN.test(key)) continue;
    out[key] = value;
  }
  return out;
}

module.exports = { INTERNAL_USER_COLUMNS, ownProfile };
