// Admin routes (shared-secret ADMIN_TOKEN, see lib/auth.js) and dev-only
// clock routes. The admin page at GET /admin is a minimal HTML console for
// org verification, safety-report review and platform metrics.
const express = require('express');
const db = require('../db');
const clock = require('../lib/clock');
const deeds = require('../lib/deeds');
const lifecycle = require('../lib/lifecycle');
const metrics = require('../lib/metrics');
const { requireAdmin, adminTokenValid, accountForRequest } = require('../lib/auth');
const { publicOrg } = require('../lib/shifts');
const { notify } = require('../lib/notify');
const { wrap } = require('./volunteer');

const admin = express.Router();

admin.get('/admin/orgs', requireAdmin, (req, res) => {
  const orgs = db.prepare('SELECT * FROM orgs ORDER BY verified, created_at').all().map((org) => ({
    ...publicOrg(org),
    registration_number: org.registration_number,
    waiver: org.waiver_kind,
    has_coordinates: org.location_lat != null && org.location_lng != null,
    created_at: org.created_at,
  }));
  res.json({ orgs });
});

admin.post('/admin/orgs/:id/verify', requireAdmin, (req, res) => {
  const verified = req.body?.verified !== false;
  const org = db.prepare('SELECT location_lat, location_lng FROM orgs WHERE id = ?').get(req.params.id);
  if (!org) return res.status(404).json({ error: 'Org not found.' });
  // Without coordinates, volunteers' distance limits can't be applied to
  // this org's shifts — verifying anyway takes an explicit override.
  if (verified && (org.location_lat == null || org.location_lng == null) && req.body?.allow_missing_location !== true) {
    return res.status(409).json({ error: 'This org has no map location, so distance limits would not apply to its shifts.', code: 'org_needs_location' });
  }
  const result = db.prepare('UPDATE orgs SET verified = ?, verified_at = ? WHERE id = ?')
    .run(verified ? 1 : 0, verified ? clock.isoNow() : null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Org not found.' });
  lifecycle.tick();
  res.json({ ok: true, verified });
});

admin.get('/admin/safety-reports', requireAdmin, (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, a.display_name AS reporter_name, b.display_name AS reported_name FROM safety_reports r
    LEFT JOIN users a ON a.id = r.reporter_user_id LEFT JOIN users b ON b.id = r.reported_user_id
    ORDER BY r.status, r.created_at DESC
  `).all();
  res.json({ reports });
});

admin.post('/admin/safety-reports/:id/review', requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE safety_reports SET status = 'reviewed', reviewer_note = ?, reviewed_at = ? WHERE id = ?")
    .run(req.body?.note ?? null, clock.isoNow(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Report not found.' });
  res.json({ ok: true });
});

admin.post('/admin/users/:id/clear-review', requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE users SET account_review = 0, matching_paused_until = NULL WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

// Staff pause a user's matching while a safety report is reviewed. The
// user is told neutrally; nothing says who reported them or why.
admin.post('/admin/users/:id/suspend', requireAdmin, (req, res) => {
  const result = db.prepare('UPDATE users SET account_review = 1 WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found.' });
  notify(req.params.id, 'account_review', 'Your account is under review',
    'A person on our team is reviewing your account, so matching is paused for now. We will be in touch.');
  res.json({ ok: true });
});

admin.get('/admin/metrics', requireAdmin, (req, res) => {
  res.json(metrics.platformMetrics());
});

admin.post('/admin/settings/shift-price', requireAdmin, (req, res) => {
  const value = Number(req.body?.deeds);
  if (!Number.isInteger(value) || value < 1) return res.status(400).json({ error: 'deeds must be a positive integer.' });
  deeds.setShiftPriceDeeds(value);
  res.json({ shift_price: value });
});

admin.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(ADMIN_PAGE);
});

// ── Dev-only clock: fast-forward the server's time to exercise the waiting
// period, grace windows, shift day and trial without waiting days. In-memory
// for this process only. Disabled when NODE_ENV=production or DEV_TOOLS=off.
const dev = express.Router();
// Signed-in users (the app's DEV CLOCK bar) or the admin token only — the
// server listens on the LAN, and moving the clock moves it for everyone.
function devEnabled(req, res, next) {
  if (!devToolsOn()) return res.status(404).json({ error: 'Not found.' });
  if (!accountForRequest(req) && !adminTokenValid(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'Sign in (or send the admin token) to use dev tools.' });
  }
  next();
}

function devToolsOn() {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_TOOLS !== 'off';
}

dev.get('/dev/clock', devEnabled, (req, res) => {
  res.json({ now: clock.isoNow(), offset_hours: Math.round((clock.offset() / clock.HOUR) * 100) / 100 });
});

dev.post('/dev/clock/advance', devEnabled, wrap((req, res) => {
  const body = req.body ?? {};
  let ms = (Number(body.hours) || 0) * clock.HOUR + (Number(body.days) || 0) * clock.DAY + (Number(body.minutes) || 0) * 60000;
  if (body.to) {
    const target = Date.parse(body.to);
    if (Number.isNaN(target)) return res.status(400).json({ error: 'to must be an ISO timestamp.' });
    ms = target - clock.nowMs();
  }
  if (ms < 0) return res.status(400).json({ error: 'The dev clock only moves forward (use /dev/clock/reset).' });
  clock.advance(ms);
  const summary = lifecycle.tick();
  res.json({ now: clock.isoNow(), offset_hours: Math.round((clock.offset() / clock.HOUR) * 100) / 100, proposals: summary.proposals.length });
}));

dev.post('/dev/clock/reset', devEnabled, (req, res) => {
  clock.reset();
  res.json({ now: clock.isoNow() });
});

dev.post('/dev/tick', devEnabled, wrap((req, res) => {
  res.json(lifecycle.tick());
}));

const ADMIN_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>In Good Company admin</title>
<style>
  body{font-family:-apple-system,Inter,sans-serif;background:#EDE7DA;color:#20291F;margin:0;padding:24px;}
  h1{font-family:Georgia,serif;font-weight:600;} h2{font-family:Georgia,serif;font-size:18px;margin-top:28px;}
  .card{background:#FBF9F3;border:1.5px solid #D7CEBB;border-radius:14px;padding:14px 16px;margin-top:10px;}
  button{background:#4F6F52;color:#F6F4EA;border:none;border-radius:999px;padding:8px 14px;font-weight:600;cursor:pointer;}
  button.ghost{background:transparent;color:#354E37;border:1.5px solid #4F6F52;}
  .muted{color:#5B6459;font-size:13px;} pre{white-space:pre-wrap;font-size:12px;}
  input{border:1.5px solid #D7CEBB;border-radius:10px;padding:8px 10px;}
</style></head><body>
<h1>In Good Company — admin</h1>
<p class="muted">Token: <input id="token" type="password" placeholder="Paste ADMIN_TOKEN" autocomplete="off"> <button onclick="load()">Load</button></p>
<h2>Organizations</h2><div id="orgs"></div>
<h2>Safety reports</h2><div id="reports"></div>
<h2>Platform metrics</h2><pre id="metrics" class="card"></pre>
<script>
const h = () => ({ 'Content-Type': 'application/json', 'X-Admin-Token': document.getElementById('token').value });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function load() {
  const orgs = await (await fetch('/admin/orgs', { headers: h() })).json();
  document.getElementById('orgs').innerHTML = (orgs.orgs || []).map((o) => '<div class="card"><b>' + esc(o.name) + '</b> ' +
    (o.verified ? '✓ verified' : '<span class="muted">unverified — shifts hidden</span>') +
    (o.has_coordinates ? '' : ' <span style="color:#B4543A;font-weight:600;">no location — distance limits are not applied</span>') +
    '<div class="muted">' + esc((o.mission_tags || []).join(', ')) + ' · reg ' + esc(o.registration_number || '—') + ' · waiver ' + esc(o.waiver || 'none') + '</div>' +
    '<button onclick="verify(\\'' + o.id + '\\',' + !o.verified + ',' + o.has_coordinates + ')">' + (o.verified ? 'Unverify' : 'Verify') + '</button></div>').join('') || esc(orgs.error);
  const reports = await (await fetch('/admin/safety-reports', { headers: h() })).json();
  document.getElementById('reports').innerHTML = (reports.reports || []).map((r) => '<div class="card"><b>' + esc(r.category) + '</b> · ' + esc(r.status) +
    '<div class="muted">' + esc(r.reporter_name) + ' (' + esc(r.reporter_user_id) + ') reported ' + esc(r.reported_name || '—') + ' (' + esc(r.reported_user_id || '—') + ') · ' + esc(r.created_at) + '</div><p>' + esc(r.description) + '</p>' +
    (r.status === 'open' ? '<textarea id="note-' + r.id + '" rows="2" placeholder="Review note" style="width:100%;border:1.5px solid #D7CEBB;border-radius:10px;padding:8px;"></textarea><p><button onclick="review(\\'' + r.id + '\\')">Mark reviewed</button></p>' : '<p class="muted">Note: ' + esc(r.reviewer_note || '—') + '</p>') +
    (r.reported_user_id ? '<p><button class="ghost" onclick="userAction(\\'' + r.reported_user_id + '\\', \\'suspend\\')">Pause this user\\'s matching</button> <button class="ghost" onclick="userAction(\\'' + r.reported_user_id + '\\', \\'clear-review\\')">Clear review</button></p>' : '') +
    '</div>').join('') || '<p class="muted">No reports.</p>';
  const m = await (await fetch('/admin/metrics', { headers: h() })).json();
  document.getElementById('metrics').textContent = JSON.stringify(m, null, 2);
}
async function verify(id, verified, hasCoordinates) {
  let allow = false;
  if (verified && !hasCoordinates) {
    allow = confirm('This org has no map location, so volunteers\\' distance limits will not apply to its shifts. Verify anyway?');
    if (!allow) return;
  }
  await fetch('/admin/orgs/' + id + '/verify', { method: 'POST', headers: h(), body: JSON.stringify({ verified, allow_missing_location: allow }) }); load();
}
async function review(id) {
  const note = (document.getElementById('note-' + id) || {}).value || '';
  await fetch('/admin/safety-reports/' + id + '/review', { method: 'POST', headers: h(), body: JSON.stringify({ note }) }); load();
}
async function userAction(id, action) { await fetch('/admin/users/' + id + '/' + action, { method: 'POST', headers: h() }); load(); }
</script></body></html>`;

module.exports = { admin, dev, devToolsOn };
