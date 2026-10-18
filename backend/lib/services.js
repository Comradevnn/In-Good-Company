// Recryption services, assigned once in index.js's async startup (the
// library is ESM-only, so it can't be loaded synchronously at require time).
// Routes read them through here instead of module-level globals in index.js.
const refs = {
  badgeService: null,
  badgeStore: null,
};

function set(values) {
  Object.assign(refs, values);
}

// D10: a counterparty's badge is served only if the library's verify()
// passes right now (signature, key status, badge status and a fresh claims
// digest). A failure looks exactly like "no badge" — no reason is leaked.
async function verifiedBadgeFor(userId) {
  const [validRecord] = await refs.badgeStore.listValidBySubject(userId);
  const signed = validRecord ? await refs.badgeStore.getSigned(validRecord.badge_id) : undefined;
  const verifyResult = signed ? await refs.badgeService.verify(signed) : null;
  if (!verifyResult?.ok) return { verified: false, badge: null };
  return { verified: true, badge: signed };
}

module.exports = { refs, set, verifiedBadgeFor };
