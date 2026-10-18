const db = require('../db');

// Resolves "Authorization: Bearer <token>" to an account, or rejects with 401.
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const account = token
    ? db.prepare('SELECT id, email, kind, created_at FROM accounts WHERE session_token = ?').get(token)
    : null;
  if (!account) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  req.account = account;
  next();
}

// Requires the account to already have a profile row (created by POST /users)
// before any of the later onboarding steps can save against it. Loads the
// row onto req.user for the lifecycle routes.
function requireProfile(req, res, next) {
  const user = db.prepare('SELECT * FROM users WHERE account_id = ?').get(req.account.id);
  if (!user) {
    return res.status(404).json({ error: 'Complete your profile before continuing.' });
  }
  req.user = user;
  next();
}

// Org-side routes: the account must be an org login with an org row.
function requireOrg(req, res, next) {
  if (req.account.kind !== 'org') {
    return res.status(403).json({ error: 'This is only available to organization accounts.' });
  }
  const org = db.prepare('SELECT * FROM orgs WHERE account_id = ?').get(req.account.id);
  if (!org && !req.allowMissingOrg) {
    return res.status(404).json({ error: 'Set up your organization first.' });
  }
  req.org = org;
  next();
}

// Admin routes (org verification, safety-report review, platform metrics).
// Prototype: a shared secret from backend/.env (ADMIN_TOKEN), sent as the
// X-Admin-Token header or ?admin_token=. With no ADMIN_TOKEN configured the
// admin routes are disabled outright rather than left open.
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const supplied = req.headers['x-admin-token'] || req.query.admin_token;
  if (!expected) {
    return res.status(503).json({ error: 'Admin routes are disabled: set ADMIN_TOKEN in backend/.env.' });
  }
  if (supplied !== expected) {
    return res.status(403).json({ error: 'Admin token required.' });
  }
  next();
}

module.exports = { requireAuth, requireProfile, requireOrg, requireAdmin };
