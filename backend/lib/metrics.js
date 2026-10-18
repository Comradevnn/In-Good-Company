// Success metrics — aggregates only. Nothing here returns another person's
// identity or individual history.
const db = require('../db');
const clock = require('./clock');
const { safeParseArray } = require('../matching/engine');

const pct = (num, den) => (den ? Math.round((1000 * num) / den) / 10 : null);
const hoursOf = (row) => (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / clock.HOUR;

function userMetrics(user) {
  const attended = db.prepare(`
    SELECT b.*, s.org_id, s.starts_at, s.ends_at FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE b.user_id = ? AND b.status = 'attended' ORDER BY s.starts_at
  `).all(user.id);
  const outcomes = db.prepare(`
    SELECT status, COUNT(*) AS n FROM bookings WHERE user_id = ? AND kind = 'paired' AND hold_id IS NOT NULL GROUP BY status
  `).all(user.id);
  const by = Object.fromEntries(outcomes.map((r) => [r.status, r.n]));
  const lateCancels = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND cancel_type = 'late'").get(user.id).n;
  const seenOrgs = new Set();
  let repeatOrg = 0;
  for (const b of attended) {
    if (seenOrgs.has(b.org_id)) repeatOrg++;
    seenOrgs.add(b.org_id);
  }
  const account = db.prepare('SELECT created_at FROM accounts WHERE id = ?').get(user.account_id);
  const firstShift = attended[0];
  const answers = db.prepare('SELECT volunteer_again FROM partner_ratings WHERE rater_user_id = ?').all(user.id);
  return {
    shifts_completed: attended.length,
    hours: Math.round(attended.reduce((sum, b) => sum + hoursOf(b), 0) * 10) / 10,
    orgs: seenOrgs.size,
    causes: safeParseArray(user.cause_tags_experienced),
    match_to_attendance_pct: pct(by.attended ?? 0, (by.attended ?? 0) + (by.no_show ?? 0) + lateCancels),
    repeat_same_org_pct: pct(repeatOrg, attended.length),
    came_back_for_another_shift: attended.length >= 2,
    days_to_first_shift: firstShift ? Math.round((Date.parse(firstShift.starts_at) - clock.parseTime(account.created_at)) / clock.DAY) : null,
    would_volunteer_again_pct: pct(answers.filter((a) => a.volunteer_again).length, answers.length),
  };
}

function orgMetrics(orgId) {
  const rows = db.prepare(`
    SELECT b.user_id, b.status, b.kind, b.hold_id, s.starts_at, s.ends_at FROM bookings b JOIN shifts s ON s.id = b.shift_id
    WHERE s.org_id = ? AND b.status IN ('attended', 'no_show', 'unverified', 'confirmed')
    ORDER BY s.starts_at
  `).all(orgId);
  const resolved = rows.filter((r) => r.status !== 'confirmed');
  const attended = rows.filter((r) => r.status === 'attended');
  const noShows = rows.filter((r) => r.status === 'no_show');
  const matched = resolved.filter((r) => r.kind === 'paired' || r.hold_id);
  // "New to this org" is per org (first attended shift at THIS org), not
  // per cause area.
  const firstVisit = new Set();
  let newToOrg = 0;
  const visits = {};
  for (const r of attended) {
    if (!firstVisit.has(r.user_id)) {
      newToOrg++;
      firstVisit.add(r.user_id);
    }
    visits[r.user_id] = (visits[r.user_id] ?? 0) + 1;
  }
  const volunteers = Object.keys(visits).length;
  const ratings = db.prepare('SELECT operational, COUNT(*) AS n FROM volunteer_org_ratings WHERE org_id = ? GROUP BY operational').all(orgId);
  const payouts = db.prepare(`
    SELECT payout_month, SUM(amount_cents) AS cents FROM forfeiture_revenue WHERE org_id = ? AND recipient = 'org'
    GROUP BY payout_month ORDER BY payout_month DESC
  `).all(orgId);
  return {
    upcoming_bookings: rows.length - resolved.length,
    turnout: {
      matched_volunteers: matched.length,
      showed_up: matched.filter((r) => r.status === 'attended').length,
      turnout_pct: pct(matched.filter((r) => r.status === 'attended').length, matched.length),
    },
    no_show_pct: pct(noShows.length, attended.length + noShows.length),
    volunteer_hours: Math.round(attended.reduce((sum, r) => sum + hoursOf(r), 0) * 10) / 10,
    new_to_org_pct: pct(newToOrg, attended.length),
    repeat_volunteer_pct: pct(Object.values(visits).filter((n) => n >= 2).length, volunteers),
    operational_ratings: Object.fromEntries([1, 2, 3, 4, 5].map((v) => [v, ratings.find((r) => r.operational === v)?.n ?? 0])),
    payouts: payouts.map((p) => ({ month: p.payout_month, usd: p.cents / 100 })),
  };
}

function platformMetrics() {
  const nowIso = clock.isoNow();
  const density = {};
  for (const s of db.prepare(`
    SELECT s.cause_tags, s.capacity_total - s.capacity_booked AS open, o.location_label FROM shifts s JOIN orgs o ON o.id = s.org_id
    WHERE o.verified = 1 AND s.status = 'open' AND s.starts_at > ?
  `).all(nowIso)) {
    const metro = (s.location_label || 'Unknown').split(',').slice(-2).join(',').trim();
    for (const tag of safeParseArray(s.cause_tags)) {
      density[metro] ??= {};
      density[metro][tag] ??= { open_spots: 0, searching_users: 0 };
      density[metro][tag].open_spots += s.open;
    }
  }
  for (const r of db.prepare(`
    SELECT u.cause_tags, u.location_city FROM availability_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'searching'
  `).all()) {
    const metro = r.location_city || 'Unknown';
    for (const tag of safeParseArray(r.cause_tags)) {
      density[metro] ??= {};
      density[metro][tag] ??= { open_spots: 0, searching_users: 0 };
      density[metro][tag].searching_users += 1;
    }
  }
  const waits = db.prepare("SELECT created_at, matched_at FROM availability_requests WHERE matched_at IS NOT NULL").all()
    .map((r) => clock.parseTime(r.matched_at) - clock.parseTime(r.created_at));
  const trend = db.prepare(`
    SELECT substr(s.starts_at, 1, 7) AS month,
      SUM(CASE WHEN b.status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
      SUM(CASE WHEN b.status IN ('attended', 'no_show') THEN 1 ELSE 0 END) AS resolved
    FROM bookings b JOIN shifts s ON s.id = b.shift_id GROUP BY month ORDER BY month
  `).all();
  const requests = Object.fromEntries(db.prepare('SELECT status, COUNT(*) AS n FROM availability_requests GROUP BY status').all().map((r) => [r.status, r.n]));
  // "Best match" vs "anyone" searches and how each ended, plus the average
  // fit of the pairings each produced — the data for deciding later whether
  // to keep both options.
  const byPreference = {};
  for (const r of db.prepare(`SELECT match_preference AS pref, status, COUNT(*) AS n FROM availability_requests WHERE kind = 'standard' GROUP BY pref, status`).all()) {
    byPreference[r.pref] ??= { by_status: {}, avg_pairing_score: null };
    byPreference[r.pref].by_status[r.status] = r.n;
  }
  for (const r of db.prepare(`
    SELECT ar.match_preference AS pref, AVG(p.score) AS avg FROM pairings p
    JOIN availability_requests ar ON ar.id IN (p.request_a_id, p.request_b_id)
    WHERE p.score IS NOT NULL AND ar.kind = 'standard' GROUP BY pref
  `).all()) {
    byPreference[r.pref] ??= { by_status: {}, avg_pairing_score: null };
    byPreference[r.pref].avg_pairing_score = Math.round(r.avg * 1000) / 1000;
  }
  return {
    cause_density_by_metro: density,
    avg_wait_hours_to_confirmed_pairing: waits.length ? Math.round((waits.reduce((a, b) => a + b, 0) / waits.length / clock.HOUR) * 10) / 10 : null,
    no_show_rate_by_month: trend.map((t) => ({ month: t.month, no_show_pct: pct(t.no_shows, t.resolved), resolved: t.resolved })),
    requests_by_status: requests,
    searches_by_match_preference: byPreference,
    open_safety_reports: db.prepare("SELECT COUNT(*) AS n FROM safety_reports WHERE status = 'open'").get().n,
  };
}

module.exports = { userMetrics, orgMetrics, platformMetrics };
