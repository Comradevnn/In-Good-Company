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
  recryption/            Recryption library integration (identity verification)
    keyStore.js            KeyManager wiring: registers the PEM key, ESM-interop loader
    hashStore.js            DuplicateDetector wiring: document_hashes table, pepper config
    badgeStore.js            BadgeService wiring: badges/signed_badges tables, D7-D9
  seed-demo-users.js     Seeds demo accounts for testing matching
  clear-demo-users.js    Removes seeded demo accounts
  test-recryption-*.js   Standalone test suites for the three Recryption modules

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

Core tables (`backend/db/schema.sql`):

- **`accounts`** — login only: email, bcrypt password hash, current session
  token. Created at signup, before any profile exists.
- **`users`** — the actual profile, one row per account (`account_id` is
  unique). Holds everything onboarding collects (name, age, gender,
  location, cause tags, partner preferences, availability, etc.) plus
  fields that only get populated once later features exist: volunteer
  history, reliability score, Deeds balance. `verified`/`verified_at`/
  `verification_badge` are denormalized **display** flags only — the badge
  lifecycle itself lives in `badges`/`signed_badges`, below. There is no
  `doc_hmac` column; that was retired when duplicate-document state moved
  to `document_hashes` (see Identity verification & security).
- **`pairings`** — confirmed matches between two `users` rows, referencing
  a `shift_id` that (for now) only resolves against the hardcoded demo
  shift list, since there's no real shifts/orgs table yet.
- **`signing_keys`** — the Ed25519 badge-signing key's lifecycle (`active` /
  `retired` / `revoked`), owned by Recryption's `KeyManager`.
- **`document_hashes`** — one row per claimed document identity
  (`doc_hmac`, subject-keyed), owned by Recryption's `DuplicateDetector`.
  This is the sole source of truth for "has this document already verified
  someone" — nothing reads `users` for that anymore.
- **`badges`** / **`signed_badges`** — the badge lifecycle (`badges`:
  status, claims digest, revocation reason) and the archived signed
  payload (`signed_badges`), both owned by Recryption's `BadgeService`.
  `users.verification_badge` mirrors the subject's latest `SignedBadge`
  for display; these two tables are authoritative.

Arrays (cause tags, interest tags, flagged users, volunteer history) are
stored as JSON text columns, since SQLite has no native array type.
`backend/db/index.js` runs `CREATE TABLE IF NOT EXISTS` plus a small set of
additive `ALTER TABLE` migrations for columns added after the table
already existed in someone's local `app.db` — including a `DROP COLUMN`
that retires `users.doc_hmac` from pre-existing databases.

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
- **What reaches the server is an attestation plus the document fields —
  never the ID image.** `POST /verification/document-check` transiently
  receives `{document_type, issuing_country, document_number}`, and `POST
  /verification/attest` receives only booleans (`name_match`, `dob_match`,
  `doc_type_confirmed`) and an expiry date. The server independently
  re-validates the expiry date and re-checks that all three booleans are
  `true` server-side rather than trusting the client.
- **Duplicate-document detection via server-side HMAC-SHA256, not a bare
  hash** (decision D6): the server computes
  `HMAC-SHA256(pepper, type:country:number)` in memory over a normalized
  document identity, discards the plaintext immediately (never stored,
  logged, or echoed), and keeps only the HMAC. This makes the value
  irreversible even if the database is exposed, and lets the server catch
  "this exact document already verified a different account" without
  retaining the document number. The pepper lives only in `backend/.env`
  (`DOC_PEPPER`) and is never distributed to clients; the endpoint is
  velocity-limited per account. *Recorded trade-off:* the server briefly
  observes the plaintext number in memory — an OPRF is the named future
  upgrade that would remove even that, deliberately not built at this
  scale.

  The duplicate check itself runs through Recryption's `DuplicateDetector`
  (`backend/recryption/hashStore.js`), not hand-rolled HMAC logic — Recryption
  is a sibling library, not part of this codebase. `DuplicateDetector` owns
  the `document_hashes` table and claims a document at **check** time
  (`POST /verification/document-check`), not at attest time.
  `POST /verification/attest` then re-validates the staged, server-computed
  hash against `document_hashes` at commit — it never re-derives or trusts
  a client-supplied hash. Claiming at check time also means a same-subject
  re-check reads as a refresh, not a conflict, which is what makes
  re-verifying with your own already-verified document work correctly
  instead of 409ing.

- **Signed badges, not a raw "verified" flag**, issued and verified through
  the Recryption library's `BadgeService`/`KeyManager`
  (`backend/recryption/badgeStore.js`, `keyStore.js`) rather than raw-PEM
  signing. The private key is generated on first run and persisted to
  `backend/keys/` (gitignored; a real deployment would hold this in a KMS,
  noted explicitly in the code) — it's touched in exactly one place
  (`keyStore.js`'s `Signer` callback), everywhere else deals only with
  `KeyManager` key records. `GET /verification/public-key` serves the
  active `KeyManager` record (`key_id`, `public_key`, `status`) instead of
  a raw SPKI PEM, so a client can also see whether the signing key is
  `active` or `retired`. The signed claims are deliberately tiny
  (`display_name`, `verification_level: 'preview'`) — since extraction is
  manual, not scanned, the badge claims "completed the flow," not "identity
  cryptographically confirmed," so it never asserts more than the pipeline
  actually backs; `'preview'` lives inside the signed payload itself, so
  tampering it to `'full'` breaks the signature.

  A few library-backed decisions, documented inline where they're made:
  - **D7** — a badge's `subject_id` is `users.id`, not `account_id`: the
    badge attests claims that live on the profile row, and `document_hashes`
    and the matching engine already key by `users.id`.
  - **D8** — the badge's claims digest is computed from source **values**
    only (`age`, `full_name`), never from derived booleans like
    `users.verified` or the attest request's `name_match`/`dob_match` — so
    a badge invalidates only when the underlying claim actually changes.
  - **D9** — re-attesting without a claim change used to leave two valid
    badges for the same subject, since neither the library's lazy
    (`verify()`) nor eager (`onClaimsChanged`) revocation paths fire on an
    *unchanged* digest. Every issuance now goes through
    `issueSuperseding()`: it issues the new badge first, then revokes every
    other previously-valid badge for that subject (issue-then-revoke so a
    signer failure never leaves a subject badge-less), keeping exactly one
    valid badge per subject at all times. The revocation reason recorded is
    `"manual"` — the library's revocation-reason enum has no "superseded"
    case, and extending the library was out of scope for this app-level
    fix.

- **Verification is revoked automatically if identity fields change** —
  both eagerly and lazily. Editing a claim field after verification
  (`POST /users`) calls `BadgeService.onClaimsChanged` server-side, which
  revokes the stale badge immediately (reason `claim_change`) and clears
  `verified`, `verified_at`, and `verification_badge` in the same update —
  enforced regardless of what the client sends. As a backstop, `verify()`
  also recomputes the claims digest on every check and auto-revokes on a
  mismatch even if the eager path was somehow missed.
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

- Re-verifying with the *same* already-verified document number used to
  incorrectly return `409`. Resolved as a side effect of routing
  duplicate-document checks through Recryption's `DuplicateDetector`
  (claim-at-check semantics treat a same-subject re-check as a refresh by
  construction) — the original root cause in the old hand-rolled check was
  never diagnosed, since that code path no longer exists.
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
| [`plotline.html`](specs/plotline.html) | Visual reference for screens it covers (style only — see `CLAUDE.md`) |

The master product spec, matching-algorithm spec, and test plan are kept in a
private repo (not published here, to avoid publishing the matching logic and
product spec alongside the showcase code) — see **Private repos** below.

## Private repos

This repo is public for showcase purposes. Its git history has been rewritten
to remove the specs below from every past commit, not just the current tree.
The following repos are private and require access to be granted by the owner:

| Repo | Contents |
|---|---|
| [`In-Good-Company-specs`](https://github.com/Comradevnn/In-Good-Company-specs) | Master product spec, matching-algorithm spec, test plan |
| [`In-Good-Company-history-backup`](https://github.com/Comradevnn/In-Good-Company-history-backup) | Original, unrewritten git history of this repo (from before the history rewrite), including the specs above in their old commits |

If you have access, clone them the same way as this repo:

```bash
gh repo clone Comradevnn/In-Good-Company-specs
gh repo clone Comradevnn/In-Good-Company-history-backup
```
