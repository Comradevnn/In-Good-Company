// Normalized document identity + server-side HMAC (decision D6, Option A:
// document-number hashing moved server-side). Mirrors the Recryption spec's
// §2.2 formula so the eventual library integration is a drop-in swap:
//   lowercase(trim(document_type)) ":" lowercase(trim(issuing_country)) ":"
//   uppercase(strip_non_alphanumeric(document_number))
// Shared by index.js (POST /verification/document-check) and
// seed-demo-users.js so stored hashes always agree on the preimage.
const crypto = require('node:crypto');

// Returns null on invalid input rather than throwing with details — callers
// respond with static messages so the submitted document number can never
// leak into an error body, log line, or trace.
function normalizeDocumentIdentity({ document_type, issuing_country, document_number } = {}) {
  if (
    typeof document_type !== 'string' ||
    typeof issuing_country !== 'string' ||
    typeof document_number !== 'string'
  ) {
    return null;
  }
  const type = document_type.trim().toLowerCase();
  const country = issuing_country.trim().toLowerCase();
  const number = document_number.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  if (!type || !country || !number) return null;
  if (type.includes(':') || country.includes(':')) return null; // ':' delimits the segments
  return `${type}:${country}:${number}`;
}

function docHmacHex(pepper, normalizedIdentity) {
  return crypto.createHmac('sha256', pepper).update(normalizedIdentity).digest('hex');
}

module.exports = { normalizeDocumentIdentity, docHmacHex };
