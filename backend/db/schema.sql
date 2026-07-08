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

  -- Identity verification (see specs/identity-verification-encryption-spec.md).
  -- PROTOTYPE STAGE: extraction is manual entry (no scanning SDK yet), no
  -- selfie/face-match, no retained ID imagery on server or device. Only the
  -- attestation result, an irreversible HMAC of the document number, and the
  -- signed badge persist. doc_hmac is HMAC-SHA256(doc number, server pepper),
  -- computed on-device — the plaintext number never reaches the server
  -- (spec points 9-10). Unique so one document can't verify two accounts.
  doc_hmac TEXT UNIQUE,
  verified_at TEXT,
  verification_badge TEXT, -- JSON: Ed25519-signed badge, status "preview" until real extraction exists
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

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
