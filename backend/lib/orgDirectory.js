// The organization directory: verified orgs a volunteer can look up by name,
// and the "I already know an org" preference. Public org fields only; nothing
// about volunteers.
const db = require('../db');
const rules = require('./rules');
const { CAUSES } = require('./causes');
const { parseArray } = require('./shifts');

// Verified orgs whose name contains `q` (case-insensitive), by name.
function searchOrgs(q) {
  const text = typeof q === 'string' ? q.trim().slice(0, rules.ORG_DIRECTORY_MAX_QUERY_CHARS) : '';
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db.prepare(`
    SELECT id, name, mission_tags, location_label FROM orgs
    WHERE verified = 1 AND lower(name) LIKE lower(?) ESCAPE '\\'
    ORDER BY name COLLATE NOCASE, id LIMIT ?
  `).all(like, rules.ORG_DIRECTORY_MAX_RESULTS).map((o) => ({
    id: o.id,
    name: o.name,
    mission_tags: parseArray(o.mission_tags),
    location_label: o.location_label,
  }));
}

function verifiedOrg(orgId) {
  return typeof orgId === 'string' ? db.prepare('SELECT * FROM orgs WHERE id = ? AND verified = 1').get(orgId) : undefined;
}

// Remembers the org the person chose and adds its causes to theirs (only
// valid cause labels, no duplicates, nothing removed). Returns false when
// the org does not exist or is not verified. A null org clears the choice
// and leaves causes alone.
function setPreferredOrg(user, orgId) {
  if (orgId === null) {
    db.prepare("UPDATE users SET preferred_org_id = NULL, updated_at = datetime('now') WHERE id = ?").run(user.id);
    return true;
  }
  const org = verifiedOrg(orgId);
  if (!org) return false;
  const causes = parseArray(user.cause_tags);
  const merged = [...new Set([...causes, ...parseArray(org.mission_tags).filter((tag) => CAUSES.includes(tag))])];
  db.prepare("UPDATE users SET preferred_org_id = ?, cause_tags = ?, updated_at = datetime('now') WHERE id = ?")
    .run(org.id, JSON.stringify(merged), user.id);
  return true;
}

module.exports = { searchOrgs, setPreferredOrg };
