# In Good Company

A volunteer-pairing app: it matches two verified volunteers to attend the
same charity shift together, so volunteering doubles as a way to meet
people. Built as a working prototype of the product described in the project's
specs (mostly private — see [Specs](#specs)).

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
  index.js              Express app: auth, profile, verification routes; mounts routes/
  db/
    schema.sql           Table definitions + inline design notes
    index.js              DB bootstrap + additive migrations (ensureColumns)
  lib/                   Lifecycle logic behind the routes
    lifecycle.js           Availability requests, proposals, confirm/decline, cancel/back-out,
                           the backed-out-on partner's choice, shift day, tick()
    matchingRunner.js      Runs matching over real requests/shifts (eligibility, cap, capacity, buddies)
    deeds.js               Deeds ledger: mock purchases, holds, release/return/forfeit, revenue rows
    premium.js             Trial, mock subscription, weekly grant, monthly cap, free late cancel
    shifts.js              Orgs/shifts queries + the atomic capacity counter
    chat.js / social.js    Chat intro + contact guard + starters; partner card, ratings, buddies, safety
    reliability.js         Reliability signal and no-show escalation
    metrics.js             User / org / platform aggregates
    referrals.js           Referral codes, credit at ID verification
    clock.js / time.js     App clock (dev offset) and platform-timezone helpers
    rules.js               Product rule values (see the private spec for their rationale)
  routes/
    volunteer.js           Home, requests/waiting, pairings, chat, bookings, ratings, buddies,
                           Deeds, Premium, referrals, safety, notifications, metrics
    org.js                 Org profile, waiver upload, shift listings, roster/check-in, org metrics
    admin.js               Admin page + routes (ADMIN_TOKEN) and dev-only clock routes
  matching/
    engine.js             Hard filters + the cause gate (pure functions)
    adjacency.js           Cause-tag "close match" table
    config.js              Every ranking weight in one place (custom, untuned)
    score.js               Fit score for two people on one shift
    affinity.js            Bounded adjustment from a user's own private fit ratings
    person.js              Builds the ranker's input from DB rows (leaves out ignored fields)
    assign.js              Picks pairs best-first across the whole pool
  keys/                  Ed25519 badge-signing key (gitignored, generated on first run)
  recryption/            Recryption library integration (identity verification)
    keyStore.js            KeyManager wiring: registers the PEM key, ESM-interop loader
    hashStore.js            DuplicateDetector wiring: document_hashes table, pepper config
    badgeStore.js            BadgeService wiring: badges/signed_badges tables, D7-D9
    INTEGRATION.md           This app's own account of the Recryption API it relies on
  seed-demo-orgs.js      Seeds demo orgs + two weeks of shifts (clear-demo-orgs.js removes them)
  seed-demo-users.js     Seeds demo volunteers (clear-demo-users.js removes them)
  test-recryption-*.js   Standalone test suites for the three Recryption modules
  test-*.js              Lifecycle suites (journey, capacity, filters, Deeds, pairing flows,
                         ratings/buddies) + test-helpers.js

mobile/
  App.js                 Screen router: onboarding state machine, then a small view stack (no nav library)
  screens/                One file per screen (onboarding, verification, home, matching, pairing,
                          chat, rating, buddies, Deeds/Premium, safety, metrics, org screens)
  components/             Shared pieces (top bar, buttons, cards, partner card, dev clock bar)
  api/client.js           fetch wrapper that surfaces the backend's error codes
  auth/                    Session token storage (Expo SecureStore) + API calls
  verification/            On-device checks before attestation; on-device badge verification
  onboarding/resume.js    Figures out which onboarding step to resume on
  theme/                  Colors/styles lifted from plotline.html

specs/                   plotline.html style reference (other specs are private — see Specs)
```

## Architecture

The mobile app is a single-page state machine, not a navigation-library
app — `App.js` holds `flow` (an ordered array of screen names) and
`stepIndex`, and swaps screens by re-rendering based on those two values.
There are two onboarding flows (`CAUSE_FLOW` vs `ORG_FLOW`), chosen based on
whether the user names a specific org or browses by cause. On every app
launch, `GET /users/me` is used to compute which step to resume at
(`onboarding/resume.js`), so users don't restart onboarding from scratch.
After onboarding, `App.js` keeps a small stack of `{ name, params }`
entries for the rest of the app (home, waiting, pairing, chat, …), still
with no navigation library. Org logins (`GET /auth/me` → `kind: 'org'`) get
the org screens instead of volunteer onboarding.

The home dashboard always shows the most urgent next step (a decision only
the user can make comes first), and screens poll the backend — there is no
push or websocket infrastructure. In-app notifications live in a
`notifications` table the app reads.

The backend is one Express app (`index.js` plus `routes/`) talking to one
SQLite file via `better-sqlite3` (synchronous, no ORM). There's no queue,
cache, or external service. Time-based transitions — proposal expiry,
decision windows, waiting caps, conversation starters, attendance
auto-resolution — plus a matching pass run in `lifecycle.tick()`, which
fires on a timer and whenever a route reads lifecycle state. All lifecycle
time goes through `lib/clock.js`, which supports a **dev-only** in-memory
offset (`POST /dev/clock/advance`, and the "DEV CLOCK" bar in dev builds),
so days-long waits and shift day can be walked through in minutes.

The mobile app discovers the backend automatically: `config/api.js` reads
the LAN IP Expo/Metro is already using and swaps in the backend's port
(3000, or `EXPO_PUBLIC_BACKEND_PORT`), so no manual IP configuration is
needed on a given network.

## Data model

Core tables (`backend/db/schema.sql`):

- **`accounts`** — login only: email, bcrypt password hash, current session
  token, and `kind` (`individual` or `org`). Created at signup, before any
  profile exists.
- **`users`** — the volunteer profile, one row per individual account.
  Holds everything onboarding collects (name, age, gender, location, cause
  tags, partner preferences, availability, etc.), volunteer history and
  hours (updated at check-in), the reliability signal (never shown to other
  users), Deeds bucket balances, Premium/referral/safety fields.
  `verified`/`verified_at`/`verification_badge` are denormalized
  **display** flags only — the badge lifecycle itself lives in
  `badges`/`signed_badges`, below.
- **`orgs`** / **`shifts`** — host organizations (verification flag,
  waiver: uploaded file or platform default) and their shift listings.
  `shifts.capacity_booked` is the live capacity counter: spots are only
  ever taken by a single conditional `UPDATE`, and a `CHECK` constraint
  makes overbooking impossible at the database level. Shifts of unverified
  orgs are invisible to volunteers and to matching.
- **`availability_requests`** — one "find me a partner" search (the
  matching "slot"): window, distance, optional buddy request, status and
  the latest honest no-match reason. A user has at most one open search.
- **`bookings`** — a person's place on a shift (`paired` or `solo`), its
  status through confirm → attended / no-show, and the Deeds hold.
- **`pairings`** — two people proposed for, then confirmed on, one shift:
  proposal expiry, who backed out, the backed-out-on partner's decision,
  contact-sharing opt-ins.
- **`deeds_ledger`** / **`deeds_holds`** / **`forfeiture_revenue`** — an
  append-only ledger (every balance change is a row, in a `purchased` or
  `free` bucket), the holds placed on confirm, and the org/platform revenue
  realized when a hold is forfeited (aggregated per month for org
  payouts). `premium_subscriptions` records mock subscriptions.
- **`messages`**, **`notifications`**, **`reliability_events`**,
  **`org_volunteer_ratings`**, **`volunteer_org_ratings`**,
  **`partner_ratings`**, **`buddies`**, **`safety_reports`**,
  **`platform_settings`** — chat, the in-app inbox, the reliability signal
  inputs, the three kinds of rating, buddy pairs, reports for human review,
  and the platform-controlled shift price.
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
`backend/db/index.js` runs `CREATE TABLE IF NOT EXISTS` plus additive
migrations for columns added after a table already existed in someone's
local `app.db` (`ensureColumns`), including retiring `users.doc_hmac`,
relabeling pairings left over from the old hardcoded demo shifts, and
turning any pre-ledger Deeds balance into an opening ledger entry.

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

The pure checks and ranking are in `backend/matching/`; `lib/matchingRunner.js`
reads every open search against the real `orgs`/`shifts` tables, asks the
planner for a set of pairings and writes the proposals.
It's a reduced version of the full matching spec — kept in the private
specs repo (see **Private repos** below). At a high level:

**Hard filters:** a pair is never formed if it fails basic eligibility —
adults only, ID-verified, mutual gender-preference compatibility — or if
either person has filed a safety report about the other (this overrides
everything, buddy status included), or either said after a past shift
that they wouldn't volunteer together again. People who have hit their
plan's monthly matched-shift cap, or whose matching is paused after repeat
no-shows, are left out of the pool, with a distinct reason so the app can
show the right next step.

**Shift alignment:** each candidate shift (verified orgs only) is checked for
cause-tag and org-mission alignment against both people, with a
hand-built adjacency table for "close enough" causes, plus the travel
radius and the person's chosen dates. Distance is only enforced when both
the volunteer and the shift have map coordinates, so the app geocodes typed
places, new orgs must give a location, and shifts inherit their org's. Which
cause combinations qualify is defined by the private spec.

**Capacity:** a proposal reserves its spots on the shift through the atomic
capacity counter as it is created, so concurrent searches, solo RSVPs and
matching runs in different processes can't overbook (each matching run is
one `IMMEDIATE` SQLite transaction).

**Ranking:** only pairs that pass every hard filter are ranked, so no score
can create a pairing. Each candidate (two people on one shift) gets a fit
score from shared interests, how close their ages are, an experience mix
that pairs someone new to a cause with someone experienced in it, how well
the shift suits each person's causes and travel distance, and each
person's own private "personal fit" ratings of past orgs and causes (these
only tune that person's own matches). Reliability can only lower a score,
and only on a record of late cancels or no-shows; someone with no history
is not penalised. A volunteer with a habit of late cancels is ranked lower
next to someone with no attended shifts, never blocked. Previous partners
are slightly less preferred unless they asked to go together as buddies.
Pairs are then chosen best-first across the whole pool: rematches after a
partner backed out come first, then searches close to their deadline, then
mutual buddy requests; time already waited adds a capped boost, so a long
waiter only loses to a clearly better pairing. A person's own "not for me"
rating of an org pushes that org's shifts to the back for them. Plan tier,
the friendship/romance preference, volunteering frequency and free-text
profile fields are never used (tier only gates the monthly cap). The
weights in `backend/matching/config.js` are this prototype's own, untuned
starting values; the private spec is the source of truth for the required
behaviour. Each pairing stores its score and a breakdown that only the
admin can see.

**Lifecycle:** a match is a *proposal*. Each person sees the exact shift
and partner and confirms — Deeds are held only at that point — or
declines. Back-outs, the backed-out-on partner's choice (new partner for
the same shift, or Deeds back) and its decision window, rematching, solo
RSVPs and the waiting-period cap with alternatives are in
`lib/lifecycle.js`; the rules behind each come from the private spec.

**Deeds and Premium:** `lib/deeds.js` and `lib/premium.js`. Purchases are
mock (no payment processor, no card data). Holds draw free Deeds (Premium
grants, referral credits) before purchased ones; forfeiture splits revenue
between the org and the platform differently for purchased and free
Deeds, per the spec.

## Identity verification & security

The original full design spec moved out of this repo and now lives with the
Recryption library; this app's own account of what it uses from Recryption is
[`backend/recryption/INTEGRATION.md`](backend/recryption/INTEGRATION.md).
The full design is a substantial pipeline — on-device OCR/MRZ extraction, a one-time
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
  previously-entered values. Re-tested during the prototype build: the
  resume routing and pre-fill logic were fine, but the screen saved and
  displayed dates in UTC, so outside UTC a saved date could come back a day
  off (or the calendar highlighted the day before). Fixed by handling dates
  as local calendar days. Re-checked in the iOS Simulator on 2026-10-18:
  resuming onto the step with only a start date, distance and frequency
  saved showed all three; Settings → "Change dates or distance" showed the
  saved values; saved dates in the past fell back to today with a note.

## Prototype scope: built vs not built

Built (the individual journey end to end, plus minimal org accounts):
signup → onboarding → ID verification → Deeds → availability → waiting
period (honest status, alternatives, a capped wait) → proposal → confirm
with Deeds hold → partner card with verified badge → chat (warm intro,
contact sharing by mutual opt-in) → shift day (org check-in, no-shows,
conversation starters) → ratings (org on two axes, org rates volunteer,
partner) → buddies → next availability. Also back-outs and the
backed-out-on partner's choice, solo RSVP, Premium (trial, mock
subscription, weekly Deeds, monthly cap, buddy slots, a penalty-free late
cancel), referrals, the reliability signal with escalation, safety
reports, share my plans, and user/org/platform metrics.

**Not built yet:**

- Calibrated ranking weights: the soft ranking is built, but its weights
  are untuned starting values. Matching also runs as soon as a search
  starts (no batching window to gather a bigger pool).
- Premium's advanced filters beyond a partner age range (hobbies/values,
  badge tier).
- Paid org tiers, billing, corporate CSR packages, org payouts as real
  money movement, and the minors / institutional partnership line (all out
  of the first prototype's scope).
- Real payments of any kind — Deeds purchases and Premium are mock.
- Push notifications (the app polls), real-time chat (polling), and an
  org-side shift cancellation flow.
- A real admin/staff tool: org verification and safety-report review are a
  minimal page behind a shared `ADMIN_TOKEN`.
- Everything listed under *Identity verification & security → Not built
  at all*, including per-shift signed event tickets for check-in (org
  check-in is a button on the roster).

## Running locally

The user's own long-lived dev copies run on port 3000 (backend) and 8081
(Metro) — **do not start servers on those ports.** For any manual
verification, use:

```bash
# Backend (from backend/)
PORT=3050 node index.js

# Metro (from mobile/), pointing the app at that backend
EXPO_PUBLIC_BACKEND_PORT=3050 npx expo start --port 8090
```

Optional `backend/.env` settings: `ADMIN_TOKEN` (at least 12 characters)
enables the admin page at `/admin` (org verification, safety reports and
pausing a user's matching, platform metrics); paste the token into the page,
which sends it as the `X-Admin-Token` header (it is never accepted in the
URL). The same token unlocks two read-only matching explain routes:
`GET /admin/pairings/:id/score` (a pairing's fit score and breakdown) and
`GET /admin/matching/preview` (what a matching run would do right now).
`TICK_INTERVAL_MS` changes the lifecycle timer (0 turns it off).
The dev clock routes (`/dev/*`) need a signed-in session or the admin token;
`DEV_TOOLS=off` disables them (they are always off when
`NODE_ENV=production`). Login and signup are rate-limited in memory
(`RATE_LIMIT=off` disables it).

Tests (from `backend/`, each starts its own server on port 3050):

```bash
node test-recryption-keymanager.js   # also: duplicates, badges, badge-reveal
node test-journey.js                 # also: capacity, matching-filters, deeds, pairing-flows,
                                     #       ratings-buddies, safety, authz, engine,
                                     #       match-score, match-assign, match-ranking
```

Or run every suite in sequence with a one-line result each:

```bash
npm test
```

From `mobile/`, the resume logic has a small `node --test onboarding/resume.test.mjs`.

The lifecycle suites (`test-*.js` other than `test-recryption-*`) each use
their own throwaway database file (`DB_PATH`), so matching runs never touch
or pair with accounts in the shared dev database.

### Running on macOS

`scripts/` holds double-clickable `.command` helpers (also runnable from a
terminal). Each one loads Node via nvm (`nvm install 24`):

| Script | Does |
|---|---|
| `setup-mac.command` | Clones + builds `../Recryption`, installs backend/mobile deps, creates `backend/data/` and `backend/.env` (fresh `DOC_PEPPER`) if missing. Re-runnable. |
| `start-backend.command` | Backend on port 3000 (`PORT=3050 ...` to override) |
| `start-mobile.command` | Metro for Expo Go on port 8081 (`METRO_PORT=8090 ...` to override) |
| `seed-demo.command` | Runs `seed-demo-orgs.js` then `seed-demo-users.js` (pass `--searching` to open a search for each demo volunteer) |
| `clear-demo.command` | Runs `clear-demo-users.js` then `clear-demo-orgs.js` |

Demo data: `seed-demo-orgs.js` adds demo orgs (`demo-org-N@example.com`,
one deliberately unverified) with about two weeks of upcoming shifts;
`seed-demo-users.js` adds verified demo volunteers (`demo-N@example.com`).
All demo passwords are `demopassword123`. The clear scripts remove only
those accounts and their rows, and refuse to run if a non-demo account is
involved (e.g. has a booking on a demo shift).
Don't delete other rows from the shared dev database — see
[`CLAUDE.md`](CLAUDE.md)'s data-deletion policy.

## Specs

| Spec | Covers |
|---|---|
| [`plotline.html`](specs/plotline.html) | Visual reference for screens it covers (style only — see `CLAUDE.md`) |
| [`INTEGRATION.md`](backend/recryption/INTEGRATION.md) | How this app uses the Recryption identity-verification library (regenerated when the Recryption version changes) |

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
