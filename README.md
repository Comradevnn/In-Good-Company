# In Good Company

A volunteer-pairing app: it matches two verified volunteers to attend the
same charity shift together, so volunteering doubles as a way to meet
people. Built as a working prototype of the product described in
[`specs/`](specs/).

- **Frontend:** React Native via Expo (`mobile/`)
- **Backend:** Node.js + Express (`backend/`)
- **Database:** SQLite, via `better-sqlite3` (`backend/data/app.db`)

Product behavior is spec-driven — see [`CLAUDE.md`](CLAUDE.md) for which
spec file governs which part of the app. This README covers how the code
that implements those specs is actually put together, and where the
prototype cuts scope relative to the full design.

## Repo layout

```
backend/
  index.js              Express app: all routes
  db/
    schema.sql           Table definitions + inline design rationale
    index.js              DB bootstrap + additive migrations
  matching/
    engine.js             Hard filters + alignment scoring (pure functions)
    adjacency.js           Cause-tag "close match" table
    demoShifts.js           Hardcoded stand-in for a real shifts/orgs data model
  keys/                  Ed25519 badge-signing key (gitignored, generated on first run)
  seed-demo-users.js     Seeds demo accounts for testing matching
  clear-demo-users.js    Removes seeded demo accounts

mobile/
  App.js                 Screen router / onboarding state machine (no nav library)
  screens/                One file per screen (onboarding, verification, settings, match, deeds)
  auth/                    Session token storage (Expo SecureStore) + API calls
  verification/localChecks.js  On-device name/DOB/expiry checks before attestation
  onboarding/resume.js    Figures out which onboarding step to resume on
  theme/                  Shared colors/styles

specs/                   Source-of-truth product specs (see CLAUDE.md)
```

## Architecture

The mobile app is a single-page state machine, not a navigation-library
app — `App.js` holds `flow` (an ordered array of screen names) and
`stepIndex`, and swaps screens by re-rendering based on those two values.
There are two onboarding flows (`CAUSE_FLOW` vs `ORG_FLOW`), chosen based on
whether the user names a specific org or browses by cause. On every app
launch, `GET /users/me` is used to compute which step to resume at
(`onboarding/resume.js`), so users don't restart onboarding from scratch.

The backend is a single `index.js` Express app talking to one SQLite file
via `better-sqlite3` (synchronous, no ORM). There's no queue, cache, or
external service — everything is a direct DB read/write per request.

The mobile app discovers the backend automatically: `config/api.js` reads
the LAN IP Expo/Metro is already using and swaps in the backend's fixed
port, so no manual IP configuration is needed on a given network.

## Data model

Two core tables (`backend/db/schema.sql`):

- **`accounts`** — login only: email, bcrypt password hash, current session
  token. Created at signup, before any profile exists.
- **`users`** — the actual profile, one row per account (`account_id` is
  unique). Holds everything onboarding collects (name, age, gender,
  location, cause tags, partner preferences, availability, etc.) plus
  fields that only get populated once later features exist: verification
  status/badge, volunteer history, reliability score, Deeds balance. These
  are pre-declared with sensible defaults rather than added later, so the
  table shape doesn't change as features land.
- **`pairings`** — confirmed matches between two `users` rows, referencing
  a `shift_id` that (for now) only resolves against the hardcoded demo
  shift list, since there's no real shifts/orgs table yet.

Arrays (cause tags, interest tags, flagged users, volunteer history) are
stored as JSON text columns, since SQLite has no native array type.
`backend/db/index.js` runs `CREATE TABLE IF NOT EXISTS` plus a small set of
additive `ALTER TABLE` migrations for columns added after the table
already existed in someone's local `app.db`.

## Auth

Email/password only, no third-party auth provider:

- Passwords hashed with **bcrypt** (10 rounds) — never stored or logged in
  plaintext.
- Login issues a random 32-byte hex **session token**, stored in the
  `accounts.session_token` column and returned to the client.
- The mobile app persists the token in `expo-secure-store` (iOS
  Keychain / Android Keystore), not plain `AsyncStorage`.
- Every authenticated request sends `Authorization: Bearer <token>`;
  `requireAuth` middleware resolves it back to an account or returns 401.
  There's no token expiry/refresh — a token is valid until the user logs in
  again (which overwrites it) or clears it (logout).

## Matching algorithm

Implemented in `backend/matching/engine.js`, triggered by
`POST /matching/run`. It's a deliberately reduced version of
[`specs/in-good-company-matching-prompt.md`](specs/in-good-company-matching-prompt.md) —
the engine file's header comment enumerates exactly what's skipped. In
scope for this build:

**Step 1 — hard filters** (`hardFiltersPass`, pure function, no DB access):
a candidate pair is rejected outright if either person is under 18, either
is unverified, gender preferences aren't mutually satisfied
(`gender_pref: 'same_gender_only' | 'any'`), or either has safety-flagged
the other. Safety flags are included even though the prototype's stated
scope was narrower, because the spec calls them out as overriding every
other rule.

**Step 2 — shift alignment** (`computeAlignment` / `passesShiftGate`): for
each candidate demo shift, a 0–1 score is computed as
`0.6 × shift_tag_alignment + 0.4 × org_mission_alignment`, where each
sub-score is `1.0` for an exact cause-tag match, `0.5` for a "close match"
via the hand-built `ADJACENCY_TABLE` (e.g. Animal welfare ↔ Environmental
cleanups), or `0.0` otherwise. A shift only counts if the combined score
clears `0.5`, the org is verified, and — if the user has saved a
lat/lng and travel radius — the shift falls within that radius
(Haversine distance; users who only entered a city with no lat/lng skip
the radius check rather than being blocked).

**Selection:** `POST /matching/run` walks all other users with a profile,
skips anyone already in a confirmed pairing, and returns the **first**
candidate that passes hard filters, has the required minimum Deeds, and shares at least one
demo shift both people clear — not the best-ranked candidate. The full
spec's Step 3 soft ranking (interest overlap, age proximity, geographic
proximity, reliability-weighted scoring, newcomer/veteran pairing) is not
implemented. A match is idempotent — re-running it returns the existing
confirmed pairing rather than recomputing.

**Deeds gate:** booking a shift costs Deeds (an in-app currency,
`users.deeds_balance`); both sides of a candidate pair need ≥5 to be
eligible. `POST /deeds/purchase` just increments the balance — there's no
real payment processing. `POST /matching/cancel` cancels the active
pairing and forfeits the canceling user's Deeds (no notification to the
other party, no reliability-score consequences — see schema.sql's
comments for the full simplifications list).

Because there's no real shifts/orgs data model yet, `matching/demoShifts.js`
hardcodes five shifts across the causes selectable in `CausesScreen.js`, all
located in the the launch market launch market so radius checks have
realistic numbers to test against.

## Identity verification & security

The full design is [`specs/identity-verification-encryption-spec.md`](specs/identity-verification-encryption-spec.md).
It's a substantial pipeline — on-device OCR/MRZ extraction, a one-time
liveness-checked selfie/ID face-match, AES-256-GCM envelope encryption of
retained ID images with an HSM/KMS-held unwrap key, hardware-bound P-256
device keys for per-event ticket proof-of-possession — most of which
**isn't built yet**. What exists in this codebase is the prototype slice:

- **No ID scanning SDK.** The user manually types their name/DOB/expiry
  from their ID (`VerifyIdScreen.js`) instead of a camera-based
  OCR/MRZ/barcode read.
- **On-device checks first** (`mobile/verification/localChecks.js`), before
  anything is sent to the server:
  - `nameMatches` — order-independent, prefix-tolerant token matching
    (`"DOE JANE MARIE"` matches `"Jane Marie Doe"`; `"Jon"` matches
    `"Jonathan"` via a ≥3-character prefix rule) so profile-name vs.
    ID-name comparison survives real-world formatting differences.
  - `dobMatchesAge` — since the profile only stores an integer age, not a
    DOB, this checks the age implied by the typed DOB against the stored
    profile age, ±1 year.
  - `expiryIsValid` — must be a real, non-expired date.
- **What reaches the server is an attestation, not the ID.** `POST
  /verification/attest` receives only booleans (`name_match`, `dob_match`,
  `doc_type_confirmed`), an expiry date, and a document-number HMAC — never
  a document image or the plaintext document number. The server
  independently re-validates the expiry date and re-checks that all
  three booleans are `true` server-side rather than trusting the client.
- **Duplicate-document detection via HMAC-SHA256, not a bare hash,** exactly
  per spec point 9: the client fetches a server-held pepper
  (`GET /verification/config`), computes `HMAC-SHA256(doc_number, pepper)`
  on-device, and only that HMAC — stored as `users.doc_hmac`, `UNIQUE` in
  the schema — is ever sent or stored. This makes the value irreversible
  even if the database is exposed, and lets the server catch "this exact
  document already verified a different account" (`409` on
  `POST /verification/attest`) without ever learning the document number.
  *Prototype caveat, called out in the code:* the pepper is served to any
  authenticated client so the HMAC can be computed on-device, which weakens
  its secrecy versus a production design — flagged directly in
  `backend/index.js`.
- **Signed badges, not a raw "verified" flag.** On success, the server
  issues an **Ed25519-signed** JSON badge (`{ user_id, display_name,
  verified: true, status: 'preview', issued_at }`) using a key pair
  generated on first run and persisted to `backend/keys/` (gitignored; a
  real deployment would hold this in a KMS, noted explicitly in the code).
  `GET /verification/public-key` exposes the public key so any party can
  verify a badge offline. The badge's `status: 'preview'` is itself part
  of the signed payload — since extraction is manual, not scanned, the
  badge deliberately claims "completed the flow," not "identity
  cryptographically confirmed," so it never asserts more than the pipeline
  actually backs.
- **Verification is revoked automatically if identity fields change.**
  Because the badge specifically attests to a name + age, editing either
  field after verification (`POST /users`) server-side clears `verified`,
  `verified_at`, `verification_badge`, and `doc_hmac` in the same update —
  enforced regardless of what the client sends, so it can't be bypassed by
  a client that omits a "please revoke" flag.
- **No image retention at all.** No ID photo, selfie, or plaintext
  document number is ever transmitted to or stored by the backend — the
  entire "encrypt and retain for 90 days" branch of the spec (points
  10–15) isn't implemented, since there's nothing to retain.
- Password hashes use bcrypt; everything else sensitive (session tokens,
  the badge signature, the doc HMAC) is either random or one-way.
  Transport security relies on TLS in any real deployment (spec point:
  "everything in transit — TLS 1.3"); the device signature slot described
  in spec point 8 is stubbed out at prototype stage, since there's no
  hardware-backed device key without a dev build — noted directly in
  `backend/index.js`.

**Not built at all (full spec scope, for future work):** camera-based
OCR/MRZ/barcode extraction, one-time liveness-checked face-match,
AES-256-GCM envelope encryption + KMS-held unwrap key for any retained
media, the 90-day retention/hard-delete lifecycle, per-shift signed event
tickets, and P-256 hardware-bound device keys for check-in
proof-of-possession.

## Known bugs and unverified items

Tracked in [`CLAUDE.md`](CLAUDE.md):

- Re-verifying with the *same* already-verified document number
  incorrectly returns `409` instead of succeeding — root cause not yet
  found, needs live debugging.
- `AvailabilityScreen`'s resume pre-fill was once observed not showing
  previously-entered values, but hasn't been reproduced — flagged for
  the dedicated testing pass in `specs/in-good-company-test-prompt.md`
  rather than being chased ad hoc.

## Running locally

The user's own long-lived dev copies run on port 3000 (backend) and 8081
(Metro) — **do not start servers on those ports.** For any manual
verification, use:

```bash
# Backend (from backend/)
PORT=3050 node index.js

# Metro (from mobile/)
npx expo start --port 8090
```

Demo data: `backend/seed-demo-users.js` seeds test accounts for exercising
the matching engine end-to-end; `backend/clear-demo-users.js` removes them.
Don't delete other rows from the shared dev database — see
[`CLAUDE.md`](CLAUDE.md)'s data-deletion policy.

## Specs

| Spec | Covers |
|---|---|
| [`volunteer-pairing-app-master-prompt.md`](specs/volunteer-pairing-app-master-prompt.md) | Overall product, features, onboarding field list |
| [`in-good-company-matching-prompt.md`](specs/in-good-company-matching-prompt.md) | Matching algorithm (hard filters, alignment scoring, ranking) |
| [`identity-verification-encryption-spec.md`](specs/identity-verification-encryption-spec.md) | ID verification pipeline, encryption, signing, event tickets |
| [`in-good-company-test-prompt.md`](specs/in-good-company-test-prompt.md) | What to test before calling a feature done |
| [`plotline.html`](specs/plotline.html) | Visual reference for screens it covers (style only — see `CLAUDE.md`) |
