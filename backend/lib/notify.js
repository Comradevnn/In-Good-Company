const db = require('../db');
const clock = require('./clock');

// In-app notification inbox — the app polls GET /notifications; there is no
// push infrastructure in the prototype.
function notify(userId, kind, title, body, ref = {}) {
  db.prepare(`
    INSERT INTO notifications (user_id, kind, title, body, ref_type, ref_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, kind, title, body ?? null, ref.type ?? null, ref.id ?? null, clock.isoNow());
}

module.exports = { notify };
