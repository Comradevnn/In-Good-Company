// Safety-report blocks between two users. A report by either person blocks
// the pair permanently: no matching, no buddyship, no chat, no contact
// sharing, no conversation starters.
const db = require('../db');
const { safeParseArray } = require('../matching/engine');

function isBlockedPair(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  const a = db.prepare('SELECT flagged_users FROM users WHERE id = ?').get(userIdA);
  const b = db.prepare('SELECT flagged_users FROM users WHERE id = ?').get(userIdB);
  return safeParseArray(a?.flagged_users).includes(userIdB) || safeParseArray(b?.flagged_users).includes(userIdA);
}

module.exports = { isBlockedPair };
