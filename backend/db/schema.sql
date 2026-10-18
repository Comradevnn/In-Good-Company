-- Users table.
--
-- Combines two sources:
--   1. The "User profile" schema in specs/in-good-company-matching-prompt.md
--      (the fields the matching engine reads/writes).
--   2. The onboarding fields collected in specs/volunteer-pairing-app-master-prompt.md
--      section 3.1 (the fields the signup flow collects) that aren't already
--      covered by #1.
--
-- Arrays and nested objects (cause_tags, interest_tags, volunteer_history,
-- flagged_users, flagged_by, cause_tags_experienced) are stored as JSON text,
-- since SQLite has no native array/object column type.
--
-- Fields that can't be populated until later features exist (ID verification,
-- reliability scoring, volunteer history, derived experience tags) default to
-- false/null/empty-list rather than being omitted, so the table shape doesn't
-- need to change once those features land.

-- Accounts: login credentials, created at signup (emailCapture screen) before
-- any profile data exists. The users profile row is created later, when the
-- quickProfile onboarding step is submitted, and links back via
-- users.account_id. Passwords are stored only as bcrypt hashes.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  session_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Link to the login account this profile belongs to (one profile per account)
  account_id TEXT UNIQUE REFERENCES accounts(id),

  -- Onboarding: basic profile (3.1 step 3)
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL, -- first-name-only, per privacy defaults (matching schema)
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,
  occupation TEXT, -- occupation or school

  -- Onboarding: location (3.1 step 1)
  location_city TEXT,
  location_lat REAL,
  location_lng REAL,
  travel_radius_miles REAL,

  -- Onboarding: org-or-cause-first (3.1 step 2)
  preferred_org_id TEXT, -- set if the user picked an existing org directly
  prospective_org_name TEXT, -- lead capture if they named an org not yet on the platform

  -- Onboarding: cause areas (3.1 step 3, shared with matching schema's cause_tags)
  cause_tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings

  -- Onboarding: basic profile continued (3.1 step 3)
  interest_tags TEXT NOT NULL DEFAULT '[]', -- JSON array of strings, non-volunteer hobbies
  personal_values TEXT, -- one or two values, in the user's own words

  -- Onboarding: intro blurb (3.1 step 4)
  bio TEXT,

  -- Onboarding: partner preference (3.1 step 5, matching schema's gender_pref)
  gender_pref TEXT NOT NULL DEFAULT 'any' CHECK (gender_pref IN ('same_gender_only', 'any')),

  -- Onboarding: friendship-vs-romance framing (3.1 step 5). Not part of the
  -- matching-prompt.md User profile schema — collected and stored, but the
  -- matching engine must NOT read this for ranking or eligibility, same as
  -- the tier field. Do not wire this into matching logic later.
  seeking TEXT NOT NULL DEFAULT 'open' CHECK (seeking IN ('friendship_only', 'open')),

  -- True once the partner-preferences screen has actually been submitted.
  -- gender_pref/seeking both default to valid values on their own, so this
  -- flag is the only way to tell "user confirmed this step" apart from
  -- "user never got here and is just sitting on defaults" — needed for
  -- onboarding resume logic.
  partner_prefs_confirmed INTEGER NOT NULL DEFAULT 0,

  -- Onboarding: volunteering frequency (3.1 step 7)
  volunteering_frequency TEXT,

  -- Onboarding: first availability (3.1 step 8, matching schema's availability_window)
  availability_window_start TEXT, -- date
  availability_window_end TEXT, -- date

  -- Matching schema fields not filled in until later features exist
  verified INTEGER NOT NULL DEFAULT 0, -- boolean, ID verification completed

  -- Identity verification (see specs/identity-verification-encryption-spec.md
  -- + backend/recryption/). PROTOTYPE STAGE: extraction is manual entry (no
  -- scanning SDK yet), no selfie/face-match, no retained ID imagery on server
  -- or device. Duplicate-document state lives in document_hashes (integration
  -- module 2); the badge lifecycle lives in badges/signed_badges (module 3).
  -- verified/verified_at are denormalized display flags the app reads;
  -- verification_badge mirrors the subject's latest SignedBadge for display.
  -- The old users.doc_hmac column was retired in module 3 (db/index.js drops
  -- it from pre-existing databases).
  verified_at TEXT,
  verification_badge TEXT, -- JSON SignedBadge {payload, sig}; the "preview" labeling lives inside the signed claims
  cause_tags_experienced TEXT NOT NULL DEFAULT '[]', -- JSON array, derived from volunteer_history
  total_volunteer_hours REAL NOT NULL DEFAULT 0, -- org-verified via check-in
  volunteering_since TEXT, -- date, null until first completed shift
  volunteer_history TEXT NOT NULL DEFAULT '[]', -- JSON array of shift-history objects
  reliability_score REAL, -- 0-100, null until the user has history
  reliability_flag_habitual_late_canceller INTEGER NOT NULL DEFAULT 0,
  reliability_flag_notably_nervous_or_first_time INTEGER NOT NULL DEFAULT 0,
  active_buddy_id TEXT,
  buddy_requested_this_slot INTEGER NOT NULL DEFAULT 0,
  flagged_users TEXT NOT NULL DEFAULT '[]', -- JSON array of user_ids this user has safety-reported
  flagged_by TEXT NOT NULL DEFAULT '[]', -- JSON array of user_ids who have safety-reported this user

  -- Deeds (master prompt 1.6). DEMO SIMPLIFICATION: real Deeds involves a
  -- purchase flow, a hold-on-confirm/release-on-attend/forfeit-on-no-show
  -- lifecycle, and an org/platform revenue split. This is just a plain
  -- integer balance, mutated by backend/index.js's demo purchase route and
  -- the matching-engine's 5-Deed match-gate / back-out deduction — no real
  -- payment processing anywhere.
  deeds_balance INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Confirmed pairings from the matching engine (see backend/matching/).
-- DEMO SIMPLIFICATION: shift_id references a hardcoded demo shift in
-- backend/matching/demoShifts.js, not a real shifts table (org accounts /
-- shift listings are an explicitly deferred deliverable — master prompt
-- section 2). This table exists mainly to give the Step 1a "no duplicate
-- pairing" hard filter something real to check, and to let a confirmed
-- match persist across app restarts rather than being recomputed fresh
-- (and possibly differently) every time.
CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_a_id TEXT NOT NULL REFERENCES users(id),
  user_b_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recryption KeyManager records (library integration, module 1 of 3 —
-- see backend/recryption/keyStore.js). Mirrors the library's SigningKey
-- shape (Recryption spec §1.1): key_id is derived from the public key
-- (SHA-256 truncated to 16 bytes, hex), and exactly one row may be
-- 'active' at a time — enforced by KeyManager, not by the schema, since
-- the library re-checks the invariant after every rotate().
--
-- INTEGRATION STAGE: the PEM at backend/keys/ is still what actually
-- signs badges (backend/index.js is untouched); this table only tracks
-- that key's lifecycle under Recryption's key_id/status model until
-- BadgeService takes over issuance in a later pass.
CREATE TABLE IF NOT EXISTS signing_keys (
  key_id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'retired', 'revoked')),
  created_at TEXT NOT NULL,
  retired_at TEXT,
  revoked_at TEXT
);

-- Recryption DuplicateDetector records (library integration, module 2 of 3
-- — see backend/recryption/hashStore.js). Mirrors the library's
-- DocumentHash shape (Recryption spec §2.2): doc_hmac is HMAC-SHA256 of the
-- normalized document identity under the pepper identified by pepper_id;
-- subject_id is the users.id that claimed the document. This table is the
-- authoritative duplicate-detection state — users.doc_hmac is still written
-- at attest for the name-change revocation path, but no duplicate decision
-- reads it anymore. Rows are claim-at-check: written when
-- POST /verification/document-check runs, not when attest commits (see the
-- module-2 integration notes in backend/recryption/hashStore.js).
CREATE TABLE IF NOT EXISTS document_hashes (
  doc_hmac TEXT PRIMARY KEY,
  pepper_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_hashes_pepper_id ON document_hashes(pepper_id);
CREATE INDEX IF NOT EXISTS idx_document_hashes_subject_id ON document_hashes(subject_id);

-- Recryption BadgeService records (library integration, module 3 of 3 —
-- see backend/recryption/badgeStore.js). badges mirrors the library's §1.3
-- BadgeRecord (the server-side, pull-checked half of verification);
-- signed_badges archives the full SignedBadge, which reissue_all needs
-- because only the signed payload carries the original claims. subject_id
-- is users.id per decision D7 (badgeStore.js).
CREATE TABLE IF NOT EXISTS badges (
  badge_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  claims_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('valid', 'revoked')),
  revoked_reason TEXT CHECK (revoked_reason IN ('claim_change', 'manual', 'key_compromise')),
  issued_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_badges_subject_status ON badges(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_badges_key_status ON badges(key_id, status);

CREATE TABLE IF NOT EXISTS signed_badges (
  badge_id TEXT PRIMARY KEY,
  badge_json TEXT NOT NULL
);

-- ════════════════════════════════════════════════════════════════════════
-- Prototype lifecycle tables: orgs/shifts, availability requests, bookings,
-- the Deeds ledger, chat, ratings, buddies and safety. Behavior is defined
-- in the private master spec (see README "Specs"); comments here describe
-- the data shape only.
--
-- Columns added to EXISTING tables for these features (accounts.kind, the
-- users Deeds/Premium/referral/safety columns, the pairings lifecycle
-- columns) are applied by ensureColumns() in db/index.js, so fresh and
-- pre-existing databases end up with the same shape.
--
-- Timestamps written by the lifecycle code are ISO-8601 UTC strings from
-- lib/clock.js (which supports a dev-only time offset), not datetime('now').
-- ════════════════════════════════════════════════════════════════════════

-- Nonprofit / host organizations. account_id links to the org's login
-- (accounts.kind = 'org'); seeded orgs have one too. Shifts of an org with
-- verified = 0 are invisible to matching and browsing. The waiver is either
-- an uploaded file under data/uploads/ (waiver_path) or the platform
-- default (waiver_kind = 'platform_default').
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT UNIQUE REFERENCES accounts(id),
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  registration_number TEXT, -- EIN or equivalent, as entered
  mission_tags TEXT NOT NULL DEFAULT '[]', -- JSON array of cause labels
  location_label TEXT,
  location_lat REAL,
  location_lng REAL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  waiver_kind TEXT CHECK (waiver_kind IN ('uploaded', 'platform_default')),
  waiver_path TEXT,
  waiver_mime TEXT,
  waiver_uploaded_at TEXT,
  created_at TEXT NOT NULL
);

-- Shift listings. capacity_booked is the live counter: every reserved spot
-- (proposed, confirmed or solo booking) increments it through a single
-- conditional UPDATE, and the CHECK makes overbooking impossible even if a
-- code path forgot to use that UPDATE.
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  title TEXT NOT NULL,
  description TEXT,
  cause_tags TEXT NOT NULL DEFAULT '[]', -- JSON array of cause labels
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  location_label TEXT,
  location_lat REAL,
  location_lng REAL,
  capacity_total INTEGER NOT NULL CHECK (capacity_total > 0),
  capacity_booked INTEGER NOT NULL DEFAULT 0 CHECK (capacity_booked >= 0 AND capacity_booked <= capacity_total),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_org ON shifts(org_id);
CREATE INDEX IF NOT EXISTS idx_shifts_starts ON shifts(starts_at);

-- One row per "please find me a partner" submission — this is the "slot":
-- a user has at most one open (searching/proposed) request at a time, and
-- at most one active pairing per request. anchor_booking_id is set when the
-- user already holds a spot on a specific shift (solo RSVP, or a rematch
-- after their partner backed out); matching then only looks at that shift.
CREATE TABLE IF NOT EXISTS availability_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'solo_rsvp', 'rematch')),
  window_start TEXT NOT NULL, -- YYYY-MM-DD, platform timezone
  window_end TEXT NOT NULL,
  travel_radius_miles REAL,
  buddy_user_id TEXT, -- set when the user asked to go with an existing buddy
  age_min INTEGER, -- Premium partner age-band filter (applies to this user's own request only)
  age_max INTEGER,
  anchor_booking_id TEXT,
  excluded_shift_ids TEXT NOT NULL DEFAULT '[]', -- shifts the user declined for this request
  status TEXT NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'proposed', 'matched', 'no_match', 'cancelled')),
  last_reason TEXT, -- latest no-match reason, for the honest waiting status
  last_checked_at TEXT,
  search_deadline TEXT NOT NULL,
  matched_at TEXT,
  ended_at TEXT,
  dismissed_at TEXT, -- user acknowledged a no_match result
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON availability_requests(user_id, status);

-- A user's place on a shift. kind 'paired' bookings carry a Deeds hold once
-- confirmed; 'solo' bookings (solo RSVP, or a spot kept after a pairing
-- ended) do not. cap_month is set when a paired booking is confirmed and
-- cleared again if it is released at no cost — counting rows by cap_month
-- is the monthly matched-shift cap.
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  pairing_id TEXT, -- the pairing this booking currently belongs to, if any
  kind TEXT NOT NULL DEFAULT 'paired' CHECK (kind IN ('paired', 'solo')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed', 'cancelled', 'attended', 'no_show', 'unverified')),
  hold_id TEXT,
  cap_month TEXT,
  confirmed_at TEXT,
  cancelled_at TEXT,
  cancel_type TEXT, -- grace | late | free_late | declined | expired | partner_released | no_match_release | safety | solo
  checked_in_at TEXT,
  resolved_at TEXT,
  org_rating_public INTEGER NOT NULL DEFAULT 0, -- user's choice: show the org's rating of this shift on their history
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_shift ON bookings(shift_id, status);

-- Append-only Deeds ledger. Each row moves Deeds within one bucket
-- ('purchased' or 'free' — Premium grants and referral credits are 'free')
-- between the user's available balance and their held balance. Summing
-- available_delta per bucket always equals users.deeds_purchased /
-- users.deeds_free; summing held_delta equals the open holds.
CREATE TABLE IF NOT EXISTS deeds_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  entry_type TEXT NOT NULL, -- opening_balance | purchase | premium_grant | referral | hold | release | return | forfeit
  bucket TEXT NOT NULL CHECK (bucket IN ('purchased', 'free')),
  available_delta INTEGER NOT NULL DEFAULT 0,
  held_delta INTEGER NOT NULL DEFAULT 0,
  hold_id TEXT,
  booking_id TEXT,
  meta TEXT, -- JSON
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON deeds_ledger(user_id);

CREATE TABLE IF NOT EXISTS deeds_holds (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  booking_id TEXT NOT NULL,
  amount_purchased INTEGER NOT NULL DEFAULT 0,
  amount_free INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'returned', 'forfeited')),
  reason TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- Revenue realized from forfeited holds, in US cents (one Deed = 100 cents).
-- recipient 'org' rows are aggregated per org per payout_month for the
-- monthly payout view; 'platform' rows are platform revenue.
CREATE TABLE IF NOT EXISTS forfeiture_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hold_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  recipient TEXT NOT NULL CHECK (recipient IN ('org', 'platform')),
  source_bucket TEXT NOT NULL CHECK (source_bucket IN ('purchased', 'free')),
  amount_cents INTEGER NOT NULL,
  payout_month TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Mock Premium subscription purchases. No payment processor, no card data.
CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('monthly', 'annual')),
  price_cents INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Chat. visible_to_user_id restricts a row to one participant (each side's
-- own warm introduction of the other person); NULL means both see it.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pairing_id TEXT NOT NULL,
  sender_user_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('intro', 'text', 'starter', 'system')),
  body TEXT NOT NULL,
  visible_to_user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_pairing ON messages(pairing_id, id);

-- In-app notification inbox (no push infrastructure).
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ref_type TEXT,
  ref_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id);

-- Reliability signal inputs. Never exposed to other users.
CREATE TABLE IF NOT EXISTS reliability_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('attended', 'grace_cancel', 'free_late_cancel', 'late_cancel', 'no_show')),
  booking_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reliability_user ON reliability_events(user_id);

-- Org's rating of one volunteer's booking: attendance and contribution,
-- separately, on a 1 (bad) .. 5 (good) scale.
CREATE TABLE IF NOT EXISTS org_volunteer_ratings (
  booking_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attendance INTEGER NOT NULL CHECK (attendance BETWEEN 1 AND 5),
  contribution INTEGER NOT NULL CHECK (contribution BETWEEN 1 AND 5),
  created_at TEXT NOT NULL
);

-- Volunteer's rating of the org for one booking, on two separate axes:
-- operational (public, aggregated on the org's profile) and personal_fit
-- (private to the volunteer; only their own matching reads it).
CREATE TABLE IF NOT EXISTS volunteer_org_ratings (
  booking_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  shift_id TEXT NOT NULL,
  operational INTEGER NOT NULL CHECK (operational BETWEEN 1 AND 5),
  personal_fit INTEGER NOT NULL CHECK (personal_fit BETWEEN 1 AND 5),
  created_at TEXT NOT NULL
);

-- Volunteer's rating of their partner. volunteer_again doubles as the
-- private buddy answer; it is never shown to the person being rated.
CREATE TABLE IF NOT EXISTS partner_ratings (
  pairing_id TEXT NOT NULL,
  rater_user_id TEXT NOT NULL,
  ratee_user_id TEXT NOT NULL,
  showed_up INTEGER NOT NULL,
  volunteer_again INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (pairing_id, rater_user_id)
);

CREATE TABLE IF NOT EXISTS buddies (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_low_id TEXT NOT NULL, -- the lexically smaller users.id of the pair
  user_high_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  source_pairing_id TEXT,
  created_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_buddies_pair ON buddies(user_low_id, user_high_id);

-- In-app safety reports, stored for human review.
CREATE TABLE IF NOT EXISTS safety_reports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  reporter_user_id TEXT NOT NULL,
  reported_user_id TEXT,
  pairing_id TEXT,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  reviewer_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

-- Platform-controlled settings (e.g. the current shift price in Deeds).
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
