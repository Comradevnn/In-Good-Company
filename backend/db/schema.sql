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
