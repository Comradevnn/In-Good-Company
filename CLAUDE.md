# In Good Company

This app matches volunteers with charity shifts. We're building it as:
- Frontend: React Native (via Expo)
- Backend: Node.js + Express
- Database: SQLite

There's a specs folder with the product design already written. Read the
relevant one before building anything:
- For the overall product and features: specs/volunteer-pairing-app-master-prompt.md
- For how matching between users works: specs/in-good-company-matching-prompt.md
- For ID verification and security: specs/identity-verification-encryption-spec.md
- For what to test before calling something done: specs/in-good-company-test-prompt.md
- For what the screens should look like: specs/plotline.html

Note: specs/plotline.html is a visual reference for what each screen should
look like, not literal code to reuse — it's plain HTML/CSS, not React Native.

Always read the relevant file above before building that part of the app.
Ask me before making any big decision that isn't already answered in these files.

## Ports for self-verification

The user runs their own long-lived copies of the backend on port 3000 and
Metro on port 8081. Never start a server on those ports — if you need to run
the backend or Metro yourself to verify a change, always use port 3050 for
the backend and port 8090 for Metro instead:
- Backend: `PORT=3050 node index.js` (from backend/)
- Metro: `npx expo start --port 8090` (from mobile/)

## Deleting data

Never delete rows from the shared dev database unless certain they're your
own test data (e.g. rows you just inserted in the same verification pass).
If there's any chance a table holds data from the user's own manual testing,
ask before deleting or clearing it — don't assume and wipe it silently.

## plotline.html is a style reference, not the spec

specs/plotline.html only covers the screens someone happened to mock up —
it does not cover every screen or field the product needs, and its flow
order (e.g. which screen comes first) can be incidental rather than
intentional. specs/volunteer-pairing-app-master-prompt.md and
specs/in-good-company-matching-prompt.md are the source of truth for what
fields and features must exist; plotline.html only governs visual style
(colors, type, layout) for the screens it does cover.

If plotline.html and the spec docs seem to disagree, or plotline.html has
no screen for something the specs require, flag it and ask rather than
guessing which one wins — the same way the emailCapture/quickProfile
ordering was flagged before building it.

## Known bugs (fix later)

- **Re-verifying with the same document number incorrectly 409s.**
  backend/index.js's POST /verification/attest duplicate-document check
  (`WHERE doc_hmac = ? AND account_id != ?`) is written to exclude the
  caller's own account, so resubmitting the exact same document on an
  already-verified account should succeed and just overwrite that
  account's doc_hmac/badge — not conflict. The user hit a 409 doing
  exactly this (same document number, already-verified account) and
  confirmed it was the identical number, not a different one. Root cause
  not yet found — the exclusion logic looks correct on inspection, so
  something else is going on. Needs live debugging (reproduce it and trace
  what account/doc_hmac the query actually sees), not just a code read.

## Known-unverified items (re-test during the reinforcement/testing phase)

- **AvailabilityScreen resume pre-fill**: the user once observed the
  availability screen (mobile/screens/AvailabilityScreen.js) not showing
  previously-entered date range/radius/frequency on return to that step, but
  couldn't reproduce it or recall the exact steps. Code inspection at the
  time found no bug in the pre-fill logic itself. Don't chase this further
  ad hoc — specifically re-test resuming onto this screen (ideally via a
  profile with availability fields partially set) during the dedicated
  testing pass called for in specs/in-good-company-test-prompt.md.
