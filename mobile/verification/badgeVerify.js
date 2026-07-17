// D10 (Recryption badgeStore.js) — the second, independent leg of
// badge-presentation-surface's trust model, alongside the server-side gate
// in backend/index.js's GET /matching/partner-badge. Re-verifies a
// counterparty's SignedBadge on-device against the public key served by
// GET /verification/public-key, using the same Ed25519 primitive and
// canonical-JSON payload encoding as Recryption's BadgeService.verify()
// (Recryption's src/badge.ts) — reimplemented here in plain JS rather than
// importing the `recryption` package itself, which is Node-targeted
// (node:crypto) and not meant to run on-device.
//
// CommonJS, unlike the ESM style of verification/localChecks.js: this lets
// backend's node-based test suite require() this exact file directly (see
// backend/test-recryption-badge-reveal.js), proving the real on-device code
// path rejects a tampered badge rather than testing a reimplementation of
// it. Metro/Babel's CJS interop makes this importable from RN screens via
// `import { verifySignedBadge } from '../verification/badgeVerify'` same as
// any other module.
const ed = require('@noble/ed25519');
const { sha512 } = require('@noble/hashes/sha512');

// @noble/ed25519 v2 needs a SHA-512 implementation wired in for its sync
// API. @noble/hashes is pure JS (no native/WebCrypto dependency), so this
// works under Hermes with no polyfill — unlike Recryption's own node:crypto
// wiring (src/badge.ts), which only runs server-side.
if (!ed.etc.sha512Sync) {
  ed.etc.sha512Sync = (...messages) => sha512(ed.etc.concatBytes(...messages));
}

// Mirrors Recryption's canonicalJson (src/badge.ts) byte-for-byte: sorted
// object keys, integers only for numbers, no whitespace. The signature
// covers exactly these bytes, so this must stay in sync with the library's
// implementation if that ever changes.
function canonicalJson(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new Error(`numbers must be integers, got ${value}`);
      }
      return String(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const keys = Object.keys(value).sort();
      const parts = keys.map((key) => {
        if (value[key] === undefined) {
          throw new Error(`undefined is not representable (key "${key}")`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      });
      return `{${parts.join(',')}}`;
    }
    default:
      throw new Error(`unsupported type: ${typeof value}`);
  }
}

// Verifies a SignedBadge {payload, sig} against the hex Ed25519 public key
// shape GET /verification/public-key serves ({key_id, public_key, status}
// — public_key is the hex string passed here). Returns a plain boolean,
// deliberately with no failure-reason detail — matching the server-side
// gate's "don't leak why" posture (D10, badgeStore.js). This checks
// signature validity only; it does NOT know about key/badge revocation or
// claims freshness (that's server-side state this device can't see) — it's
// the second, independent check, not a replacement for the server-side
// gate that already refuses to serve a revoked or stale badge.
function verifySignedBadge(signedBadge, publicKeyHex) {
  if (!signedBadge?.payload || typeof signedBadge.sig !== 'string') return false;
  // ed.etc.hexToBytes throws (not returns undefined) on malformed hex, so
  // a bad public key or a tampered/truncated sig must be caught here too,
  // not just the canonicalization + verify below.
  try {
    const publicKey = ed.etc.hexToBytes(publicKeyHex ?? '');
    const signature = ed.etc.hexToBytes(signedBadge.sig);
    const message = new TextEncoder().encode(canonicalJson(signedBadge.payload));
    return ed.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

module.exports = { verifySignedBadge, canonicalJson };
