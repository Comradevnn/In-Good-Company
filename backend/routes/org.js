// Org-side routes: org profile and verification status, waiver/consent
// upload, shift listings with live capacity, the shift-day roster with
// check-in / no-show, rating volunteers, aggregate metrics and payouts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const clock = require('../lib/clock');
const lifecycle = require('../lib/lifecycle');
const metrics = require('../lib/metrics');
const services = require('../lib/services');
const { requireAuth, requireOrg } = require('../lib/auth');
const { orgShifts, publicOrg, parseArray } = require('../lib/shifts');
const { zonedToUtc } = require('../lib/time');
const { wrap } = require('./volunteer');

const router = express.Router();
const { CAUSES } = require('../lib/causes');
const { isRealDate } = require('../lib/time');
const UPLOAD_DIR = path.join(path.dirname(db.name), 'uploads', 'waivers');
const WAIVER_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
const MAX_WAIVER_BYTES = 5 * 1024 * 1024;

function orgView(org) {
  return {
    ...publicOrg(org),
    registration_number: org.registration_number,
    location_lat: org.location_lat,
    location_lng: org.location_lng,
    verified_at: org.verified_at,
    waiver: org.waiver_kind ? { kind: org.waiver_kind, uploaded_at: org.waiver_uploaded_at } : null,
    // Shifts stay invisible to volunteers until the org is verified.
    shifts_visible_to_volunteers: Boolean(org.verified),
  };
}

function orgAccount(req, res, next) {
  requireAuth(req, res, () => requireOrg(req, res, next));
}

function cleanTags(tags) {
  return Array.isArray(tags) ? tags.filter((t) => CAUSES.includes(t)) : [];
}

// Optional text field: absent/null is fine; otherwise a string within max.
function optionalText(body, field, max) {
  const value = body[field];
  if (value == null || value === '') return { value: null };
  if (typeof value !== 'string' || value.trim().length > max) return { error: `${field} must be text of ${max} characters or fewer.` };
  return { value: value.trim() };
}

function optionalCoordinate(body, field, min, max) {
  const value = body[field];
  if (value == null || value === '') return { value: null };
  const num = Number(value);
  if (typeof value === 'boolean' || !Number.isFinite(num) || num < min || num > max) return { error: `${field} must be a number between ${min} and ${max}.` };
  return { value: num };
}

function firstError(...results) {
  return results.find((r) => r.error)?.error ?? null;
}

// Creates the org row for an org-kind account (one org per account).
router.post('/orgs', requireAuth, wrap((req, res) => {
  if (req.account.kind !== 'org') return res.status(403).json({ error: 'Sign up as an organization to create one.' });
  if (db.prepare('SELECT 1 FROM orgs WHERE account_id = ?').get(req.account.id)) {
    return res.status(409).json({ error: 'This account already has an organization.' });
  }
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Organization name is required.' });
  if (name.length > 100) return res.status(400).json({ error: 'Organization name must be 100 characters or fewer.' });
  const missionTags = cleanTags(body.mission_tags);
  if (missionTags.length === 0) return res.status(400).json({ error: 'Pick at least one cause your organization works on.' });
  const description = optionalText(body, 'description', 500);
  const website = optionalText(body, 'website', 200);
  const registration = optionalText(body, 'registration_number', 40);
  const locationLabel = optionalText(body, 'location_label', 100);
  const lat = optionalCoordinate(body, 'location_lat', -90, 90);
  const lng = optionalCoordinate(body, 'location_lng', -180, 180);
  const invalid = firstError(description, website, registration, locationLabel, lat, lng);
  if (invalid) return res.status(400).json({ error: invalid });
  if (website.value && !/^https?:\/\/\S+$/i.test(website.value)) return res.status(400).json({ error: 'Website must start with http:// or https://.' });
  // Coordinates are what make volunteers' travel-distance limits apply.
  if (lat.value == null || lng.value == null) {
    return res.status(400).json({ error: 'Add where your organization is (a map location) so volunteers can be matched by distance.', code: 'location_required' });
  }
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO orgs (id, account_id, name, description, website, registration_number, mission_tags, location_label,
      location_lat, location_lng, verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, req.account.id, name, description.value, website.value, registration.value,
    JSON.stringify(missionTags), locationLabel.value, lat.value, lng.value, clock.isoNow());
  res.status(201).json(orgView(db.prepare('SELECT * FROM orgs WHERE id = ?').get(id)));
}));

router.get('/orgs/mine', orgAccount, (req, res) => {
  res.json(orgView(req.org));
});

// Waiver / consent form: upload a photo or PDF (base64 JSON body), or use
// the platform's default form.
router.post('/orgs/mine/waiver', orgAccount, wrap((req, res) => {
  const body = req.body ?? {};
  if (body.use_default) {
    db.prepare(`UPDATE orgs SET waiver_kind = 'platform_default', waiver_path = NULL, waiver_mime = NULL, waiver_uploaded_at = ? WHERE id = ?`)
      .run(clock.isoNow(), req.org.id);
    return res.json(orgView(db.prepare('SELECT * FROM orgs WHERE id = ?').get(req.org.id)));
  }
  const ext = WAIVER_TYPES[body.mime];
  if (!ext || typeof body.data_base64 !== 'string') {
    return res.status(400).json({ error: 'Upload a JPEG, PNG or PDF (mime + data_base64), or set use_default.' });
  }
  const bytes = Buffer.from(body.data_base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_WAIVER_BYTES) return res.status(400).json({ error: 'Waiver files must be under 5 MB.' });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, `${req.org.id}.${ext}`);
  fs.writeFileSync(file, bytes);
  db.prepare(`UPDATE orgs SET waiver_kind = 'uploaded', waiver_path = ?, waiver_mime = ?, waiver_uploaded_at = ? WHERE id = ?`)
    .run(path.relative(path.dirname(db.name), file), body.mime, clock.isoNow(), req.org.id);
  res.json(orgView(db.prepare('SELECT * FROM orgs WHERE id = ?').get(req.org.id)));
}));

router.get('/orgs/mine/waiver', orgAccount, (req, res) => {
  if (req.org.waiver_kind !== 'uploaded') return res.status(404).json({ error: 'No uploaded waiver.' });
  res.type(req.org.waiver_mime).send(fs.readFileSync(path.join(path.dirname(db.name), req.org.waiver_path)));
});

// List a shift. Allowed before verification, but invisible until then.
router.post('/orgs/mine/shifts', orgAccount, wrap((req, res) => {
  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const causeTags = cleanTags(body.cause_tags);
  const capacity = Number(body.capacity);
  const timeRe = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  if (!title) return res.status(400).json({ error: 'Give the shift a title.' });
  if (title.length > 100) return res.status(400).json({ error: 'Shift title must be 100 characters or fewer.' });
  const description = optionalText(body, 'description', 1000);
  const locationLabel = optionalText(body, 'location_label', 100);
  const lat = optionalCoordinate(body, 'location_lat', -90, 90);
  const lng = optionalCoordinate(body, 'location_lng', -180, 180);
  const invalid = firstError(description, locationLabel, lat, lng);
  if (invalid) return res.status(400).json({ error: invalid });
  if (causeTags.length === 0) return res.status(400).json({ error: 'Pick the cause area this shift maps to.' });
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return res.status(400).json({ error: 'Capacity must be a whole number of volunteers.' });
  if (!isRealDate(body.date) || !timeRe.test(body.start_time ?? '') || !timeRe.test(body.end_time ?? '')) {
    return res.status(400).json({ error: 'Date (YYYY-MM-DD) and start/end times (HH:MM) are required.' });
  }
  const [sh, sm] = body.start_time.split(':').map(Number);
  const [eh, em] = body.end_time.split(':').map(Number);
  const startsAt = zonedToUtc(body.date, sh, sm);
  const endsAt = zonedToUtc(body.date, eh, em);
  if (endsAt <= startsAt) return res.status(400).json({ error: 'The shift must end after it starts.' });
  if (startsAt.getTime() <= clock.nowMs()) return res.status(400).json({ error: 'The shift must be in the future.' });
  const id = crypto.randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO shifts (id, org_id, title, description, cause_tags, starts_at, ends_at, location_label, location_lat, location_lng,
      capacity_total, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.org.id, title, description.value, JSON.stringify(causeTags), startsAt.toISOString(), endsAt.toISOString(),
    locationLabel.value ?? req.org.location_label, lat.value ?? req.org.location_lat, lng.value ?? req.org.location_lng,
    capacity, clock.isoNow());
  lifecycle.tick();
  res.status(201).json(orgShifts(req.org.id).find((s) => s.id === id));
}));

router.get('/orgs/mine/shifts', orgAccount, (req, res) => {
  res.json({ shifts: orgShifts(req.org.id), verified: Boolean(req.org.verified) });
});

// Shift-day roster: first name and verification status only — the minimum
// an org needs for check-in. No raw ID data, no contact details.
router.get('/orgs/mine/shifts/:id/roster', orgAccount, wrap(async (req, res) => {
  lifecycle.tick();
  const shift = orgShifts(req.org.id).find((s) => s.id === req.params.id);
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });
  const rows = db.prepare(`
    SELECT b.*, u.display_name, u.verified FROM bookings b JOIN users u ON u.id = b.user_id
    WHERE b.shift_id = ? AND b.status IN ('confirmed', 'attended', 'no_show', 'unverified') ORDER BY u.display_name
  `).all(shift.id);
  const roster = [];
  for (const row of rows) {
    const badge = await services.verifiedBadgeFor(row.user_id);
    const rating = db.prepare('SELECT attendance, contribution FROM org_volunteer_ratings WHERE booking_id = ?').get(row.id);
    const partnerBookingId = row.pairing_id
      ? db.prepare('SELECT booking_a_id, booking_b_id FROM pairings WHERE id = ?').get(row.pairing_id) : null;
    roster.push({
      booking_id: row.id,
      first_name: row.display_name,
      verified_badge: badge.verified,
      status: row.status,
      kind: row.kind,
      paired: Boolean(row.pairing_id),
      paired_with_booking_id: partnerBookingId
        ? (partnerBookingId.booking_a_id === row.id ? partnerBookingId.booking_b_id : partnerBookingId.booking_a_id) : null,
      checked_in_at: row.checked_in_at,
      rating,
    });
  }
  res.json({ shift, roster });
}));

router.post('/orgs/mine/bookings/:id/check-in', orgAccount, wrap((req, res) => {
  res.json(lifecycle.checkIn(req.org, req.params.id));
}));

router.post('/orgs/mine/bookings/:id/no-show', orgAccount, wrap((req, res) => {
  res.json(lifecycle.markNoShow(req.org, req.params.id));
}));

// Org rates a volunteer's shift: attendance and contribution, separately.
router.post('/orgs/mine/bookings/:id/rate', orgAccount, wrap((req, res) => {
  const booking = lifecycle.getBooking(req.params.id);
  const shift = booking && orgShifts(req.org.id).find((s) => s.id === booking.shift_id);
  if (!shift) return res.status(404).json({ error: 'Booking not found.' });
  if (!['attended', 'no_show'].includes(booking.status)) return res.status(409).json({ error: 'Rate a volunteer once their attendance is recorded.' });
  const scale = (v) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Number(v) : null);
  const attendance = scale(req.body?.attendance);
  const contribution = scale(req.body?.contribution);
  if (!attendance || !contribution) return res.status(400).json({ error: 'attendance and contribution must each be 1-5.' });
  db.prepare(`
    INSERT INTO org_volunteer_ratings (booking_id, org_id, user_id, attendance, contribution, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(booking_id) DO UPDATE SET attendance = excluded.attendance, contribution = excluded.contribution
  `).run(booking.id, req.org.id, booking.user_id, attendance, contribution, clock.isoNow());
  res.json({ ok: true });
}));

router.get('/orgs/mine/metrics', orgAccount, (req, res) => {
  res.json(metrics.orgMetrics(req.org.id));
});

module.exports = { router, parseArray };
