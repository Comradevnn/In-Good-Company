## Recryption

Read recryption/INTEGRATION.md before changing anything that touches
verification, badges, signing keys or duplicate detection. Regenerate it
whenever the Recryption version changes (see the root CLAUDE.md).

## Known bugs (fix later)

- **[RESOLVED by replacement, original root cause never diagnosed]
  Re-verifying with the same document number incorrectly 409'd.** The user
  hit a 409 resubmitting the identical document on their already-verified
  account, even though the old duplicate check (`WHERE doc_hmac = ? AND
  account_id != ?`) looked correct on inspection. That hand-rolled
  implementation was deleted in Recryption integration module 2: duplicate
  decisions now go through the library's DuplicateDetector, whose
  subject-keyed claims treat a same-subject re-check as a refresh by
  construction — the conflict path no longer exists for that scenario. The
  exact reported flow (same account, same document, re-check then
  re-attest) is covered by passing HTTP-level tests in
  backend/test-recryption-duplicates.js. If a same-document 409 ever
  reappears, it is a new bug, not this one.
