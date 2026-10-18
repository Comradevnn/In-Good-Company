# In Good Company

This app matches volunteers with charity shifts.

The product design is already written. Most specs live in private repos
checked out as siblings of this one (paths below are relative to this repo's
root), not in this repo's specs/ folder. Read the relevant one before
building anything:
- For the overall product and features: ../In-Good-Company-specs/volunteer-pairing-app-master-prompt.md
- For how matching between users works: ../In-Good-Company-specs/in-good-company-matching-prompt.md
- For ID verification and security: backend/recryption/INTEGRATION.md (in
  this repo; see "Recryption" below)
- For what to test before calling something done: ../In-Good-Company-specs/in-good-company-test-prompt.md
- For what the screens should look like: specs/plotline.html (in this repo)

If a sibling checkout is missing, ask me rather than building without the spec.

Always read the relevant file above before building that part of the app.
Ask me before making any big decision that isn't already answered in these files.

## This repo is public

This repo is a public showcase. Its history was rewritten to remove the
private specs. Never copy private spec content (matching weights,
thresholds, algorithm details, product-spec text) into anything in this
repo: code comments, README, commit messages, or specs/. Describe behavior
at a high level and point to the private repo instead. Don't put private
spec files under specs/ either.

## Recryption

Recryption (identity-verification library, sibling checkout ../Recryption)
is an external dependency. It is moving to closed source, so don't rely on
its source or its internal spec. This app keeps its own understanding of
the integration in backend/recryption/INTEGRATION.md, built from the
library's public API plus this backend's wiring code.

Regenerate INTEGRATION.md when the library itself changes: a new version
or release, a change to the `recryption` entry in backend/package.json, or
new commits in ../Recryption that touch its source (src/), public exports
or published API docs. Commits that only touch lockfiles, tests, tooling or
README wording don't count. After regenerating, re-run the backend's
Recryption tests. Don't edit Recryption itself from this repo.

## Setup and tests

- First-time setup on a Mac: `scripts/setup-mac.command`. It clones and
  builds ../Recryption, installs dependencies (mobile needs
  `npm ci --legacy-peer-deps`), creates backend/data/, and creates
  backend/.env with a `DOC_PEPPER`. The backend won't start without either
  of the last two. Node 24 comes from nvm.
- Backend tests: `node test-recryption-<name>.js` from backend/ (badges,
  badge-reveal, duplicates, keymanager). They start their own server on
  port 3050 and clean up their own rows.
- Recryption's own tests: `npm test` in ../Recryption.

## Ports for self-verification

The user runs their own long-lived copies of the backend on port 3000 and
Metro on port 8081. Never start a server on those ports — if you need to run
the backend or Metro yourself to verify a change, always use port 3050 for
the backend and port 8090 for Metro instead:
- Backend: `PORT=3050 node index.js` (from backend/)
- Metro: `npx expo start --port 8090` (from mobile/)

The scripts/ helpers default to the user's ports. When you run them, use
`PORT=3050 scripts/start-backend.command` and
`METRO_PORT=8090 scripts/start-mobile.command`.

## Deleting data

Never delete rows from the shared dev database unless certain they're your
own test data (e.g. rows you just inserted in the same verification pass).
If there's any chance a table holds data from the user's own manual testing,
ask before deleting or clearing it — don't assume and wipe it silently.

For demo data, use `scripts/seed-demo.command` and
`scripts/clear-demo.command`. The clear script removes only
`demo-N@example.com` accounts and their rows.

## plotline.html is a style reference, not the spec

specs/plotline.html only covers the screens someone happened to mock up —
it does not cover every screen or field the product needs, and its flow
order (e.g. which screen comes first) can be incidental rather than
intentional. The master spec and matching spec (see above) are the
source of truth for what fields and features must exist; plotline.html
only governs visual style (colors, type, layout) for the screens it does
cover.

If plotline.html and the spec docs seem to disagree, or plotline.html has
no screen for something the specs require, flag it and ask rather than
guessing which one wins — the same way the emailCapture/quickProfile
ordering was flagged before building it.

## Known-unverified items (re-test during the reinforcement/testing phase)

- **AvailabilityScreen resume pre-fill**: the user once observed the
  availability screen (mobile/screens/AvailabilityScreen.js) not showing
  previously-entered date range/radius/frequency on return to that step, but
  couldn't reproduce it or recall the exact steps. Code inspection at the
  time found no bug in the pre-fill logic itself. Don't chase this further
  ad hoc — specifically re-test resuming onto this screen (ideally via a
  profile with availability fields partially set) during the dedicated
  testing pass called for in the test spec (see above).
  Re-tested in the iOS Simulator on 2026-10-18 (prototype iteration pass):
  resume with only start date, radius and frequency set pre-filled all
  three; the edit path from "Change dates or distance" pre-filled; past
  saved dates fell back to today with a note. Not reproduced. A UTC
  date-shift bug in this screen was found and fixed earlier in the build.
