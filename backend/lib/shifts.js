// Orgs and shift listings, plus the live capacity counter.
const db = require('../db');
const { formatShiftWhen } = require('./time');

function parseArray(json) {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The only way capacity is taken: one conditional UPDATE, so two writers
// (two matching runs, two solo RSVPs, two processes) can never both take the
// last spot. Returns true if the spots were reserved.
function reserveSpots(shiftId, count) {
  if (count <= 0) return true;
  const result = db.prepare(`
    UPDATE shifts SET capacity_booked = capacity_booked + @count
    WHERE id = @id AND status = 'open' AND capacity_booked + @count <= capacity_total
  `).run({ id: shiftId, count });
  return result.changes === 1;
}

function releaseSpots(shiftId, count) {
  if (count <= 0) return;
  db.prepare(`
    UPDATE shifts SET capacity_booked = MAX(capacity_booked - ?, 0) WHERE id = ?
  `).run(count, shiftId);
}

// Shift row + its org, in the shape matching/engine.js expects
// ({cause_tags, location, org: {verified, mission_tags}}) plus display fields.
function hydrate(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    title: row.title,
    description: row.description,
    cause_tags: parseArray(row.cause_tags),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    when_label: formatShiftWhen(row.starts_at, row.ends_at, row.timezone),
    location_label: row.location_label,
    location: row.location_lat != null && row.location_lng != null ? { lat: row.location_lat, lng: row.location_lng } : null,
    capacity_total: row.capacity_total,
    capacity_booked: row.capacity_booked,
    capacity_remaining: row.capacity_total - row.capacity_booked,
    status: row.status,
    org: {
      id: row.org_id,
      name: row.org_name,
      verified: Boolean(row.org_verified),
      mission_tags: parseArray(row.org_mission_tags),
    },
  };
}

const SHIFT_SELECT = `
  SELECT s.*, o.name AS org_name, o.verified AS org_verified, o.mission_tags AS org_mission_tags
  FROM shifts s JOIN orgs o ON o.id = s.org_id
`;

function getShift(shiftId) {
  return hydrate(db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(shiftId));
}

// Shifts volunteers can see or be matched into: open, starting after
// `afterIso`, at a verified org. Unverified orgs' shifts never appear here.
function visibleShifts(afterIso) {
  return db.prepare(`${SHIFT_SELECT} WHERE s.status = 'open' AND o.verified = 1 AND s.starts_at > ? ORDER BY s.starts_at`)
    .all(afterIso).map(hydrate);
}

function orgShifts(orgId) {
  return db.prepare(`${SHIFT_SELECT} WHERE s.org_id = ? ORDER BY s.starts_at`).all(orgId).map(hydrate);
}

// Public org profile fields only.
function publicOrg(org) {
  return {
    id: org.id,
    name: org.name,
    description: org.description,
    website: org.website,
    mission_tags: parseArray(org.mission_tags),
    location_label: org.location_label,
    verified: Boolean(org.verified),
  };
}

module.exports = { parseArray, reserveSpots, releaseSpots, hydrate, getShift, visibleShifts, orgShifts, publicOrg, SHIFT_SELECT };
