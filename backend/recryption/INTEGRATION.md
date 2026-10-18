# Recryption integration — In Good Company's understanding

This is the app's own account of how it uses Recryption. It's written from
the library's public API and from this backend's wiring code, not copied from
Recryption's internals. Recryption is planned to become closed source and
ship as a release with published API docs. When that happens, this file
should be rebuilt from those docs plus the code below, and should still
describe only the API contract.

**Generated against:** Recryption `0.1.0`, commit `fd4251e` (local checkout
`../../Recryption`, linked via `"recryption": "file:../../Recryption"` in
`backend/package.json`).

**Regenerate this file when the library itself changes:** a new version or
release, a change to the `recryption` entry in `backend/package.json`, or new
commits in `../Recryption` that touch its source (`src/`), public exports or
published API docs. Commits that only touch lockfiles, tests, tooling or
README wording don't count.
Update the "Generated against" line, re-derive every section from the
library's public exports and docs, then re-run the `test-recryption-*.js`
suites (see `backend/CLAUDE.md`).

## Module seam

- Recryption is ESM-only (its exports map has only an `import` condition), so
  `require('recryption')` fails in this CommonJS backend. Every consumer goes
  through `loadRecryption()` in `keyStore.js` (dynamic `import()`). Startup
  in `index.js` is therefore async.
- The library is storage-agnostic. It defines `KeyStore`, `BadgeStore` and
  `DocumentHashStore` interfaces, and this app implements them over SQLite in
  the three wiring modules below.

## What the app uses

| Library export | Wired in | App table(s) | Used for |
|---|---|---|---|
| `KeyManager`, `deriveKeyId` | `keyStore.js` (`SqliteKeyStore`) | `signing_keys` | Registers the Ed25519 badge key (`backend/keys/badge-signing-key.pem`, generated on first run) via `rotate()`; `GET /verification/public-key` serves `getActiveKey()` |
| `Signer` callback | `keyStore.js` (`makeSigner`) | — | The only place the private key is touched. Swapping the PEM for a KMS means changing only this function |
| `DuplicateDetector`, `InvalidDocumentError` | `hashStore.js` (`SqliteDocumentHashStore`) | `document_hashes` | `checkDuplicate()` in `POST /verification/document-check` |
| `PepperConfig` | `hashStore.js` (`buildPepperConfig`) | — | Built from `DOC_PEPPER` (+ optional `DOC_PEPPER_ID`, default `doc-pepper-v1`). The library rejects weak or short peppers at startup |
| `BadgeService` | `badgeStore.js` (`SqliteBadgeStore`) | `badges`, `signed_badges` | `issue()`, `verify()`, `onClaimsChanged()`, `revokeBadge()` |

## Library behaviours the app relies on

These are the parts of the API contract that the app's correctness depends
on. Re-check each one when regenerating this file.

- **Claim at check time.** `checkDuplicate()` both answers whether the
  document is already in use and records the claim, in one call. A re-check
  by the same subject refreshes the claim instead of conflicting with it.
  This is what fixed the old same-document 409.
- **Plaintext never retained.** The document number exists only inside
  `checkDuplicate()`, and is never stored, logged or returned.
- **Versioned pepper (library D5).** Each stored hash carries its
  `pepper_id`. Lookups can check `previous` peppers, but this app configures
  none.
- **Pull-based revocation (library D4).** `verify()` checks the signature,
  the key's status and the badge's status, and recomputes the claims digest
  against current source values, on every call. Never cache a "valid"
  result.
- **Key lifecycle (library D3).** Keys go `active → retired`, or from either
  of those to `revoked`. Retired keys still verify, while revoked keys fail
  immediately. `key_id` is derived from the public key, so every machine that
  generates its own key gets a different `key_id`.
- **`issue()` is additive.** It never revokes older badges. The app
  enforces one valid badge per subject itself (D9 below).

## App-level decisions layered on top (D6–D10)

These are this app's decisions, separate from the library's D1–D5. They're
documented inline where they're made:

- **D6**: document hashing happens on the server. The pepper is never sent to
  clients, and checks are velocity-limited per account (`index.js`).
- **D7**: a badge's `subject_id` is `users.id`, not `account_id`
  (`badgeStore.js`).
- **D8**: the claims digest is computed from source values only (`age`,
  `full_name`), never from derived booleans (`badgeStore.js`).
- **D9**: issuing goes through `issueSuperseding()`, which issues first and
  then revokes the subject's other valid badges, so exactly one valid badge
  exists per subject (`badgeStore.js`).
- **D10**: the server runs `verify()` before serving a partner's badge
  (`GET /matching/partner-badge`). Client-side Ed25519 verification is the
  second, independent check (`badgeStore.js`).

## Known gaps

- The library's revocation-reason enum has no "superseded" value, so D9
  records `"manual"`.
- No KMS. The signing key is a local PEM file, gitignored, and created per
  machine.
