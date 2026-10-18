// Deeds ledger. Every balance change is a deeds_ledger row; the bucket
// columns on users (deeds_purchased / deeds_free) and the deeds_balance
// total are kept in step inside the same transaction. Mock payments only —
// nothing here talks to a payment processor or sees card data.
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const { monthKey } = require('./time');

class DeedsError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function shiftPriceDeeds() {
  const row = db.prepare("SELECT value FROM platform_settings WHERE key = 'shift_price_deeds'").get();
  return row ? Number(row.value) : rules.DEFAULT_SHIFT_PRICE_DEEDS;
}

function setShiftPriceDeeds(value) {
  db.prepare(`
    INSERT INTO platform_settings (key, value) VALUES ('shift_price_deeds', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(value));
}

function balances(userId) {
  const user = db.prepare('SELECT deeds_purchased, deeds_free, deeds_balance FROM users WHERE id = ?').get(userId);
  const held = db.prepare(`
    SELECT COALESCE(SUM(amount_purchased + amount_free), 0) AS n FROM deeds_holds WHERE user_id = ? AND status = 'held'
  `).get(userId).n;
  return {
    available: user.deeds_balance,
    available_purchased: user.deeds_purchased,
    available_free: user.deeds_free,
    held,
  };
}

function writeEntry(userId, entry) {
  db.prepare(`
    INSERT INTO deeds_ledger (user_id, entry_type, bucket, available_delta, held_delta, hold_id, booking_id, meta, created_at)
    VALUES (@user_id, @entry_type, @bucket, @available_delta, @held_delta, @hold_id, @booking_id, @meta, @created_at)
  `).run({
    user_id: userId,
    entry_type: entry.type,
    bucket: entry.bucket,
    available_delta: entry.available ?? 0,
    held_delta: entry.held ?? 0,
    hold_id: entry.holdId ?? null,
    booking_id: entry.bookingId ?? null,
    meta: entry.meta ? JSON.stringify(entry.meta) : null,
    created_at: clock.isoNow(),
  });
  const column = entry.bucket === 'purchased' ? 'deeds_purchased' : 'deeds_free';
  if (entry.available) {
    db.prepare(`UPDATE users SET ${column} = ${column} + ?, deeds_balance = deeds_balance + ? WHERE id = ?`)
      .run(entry.available, entry.available, userId);
  }
}

const credit = db.transaction((userId, bucket, amount, type, meta) => {
  writeEntry(userId, { type, bucket, available: amount, meta });
});

// Mock purchase: fixed packs, no card data, no processor.
function purchase(userId, deeds) {
  if (!rules.PURCHASE_PACKS.includes(deeds)) {
    throw new DeedsError('invalid_pack', `Deeds come in packs of ${rules.PURCHASE_PACKS.join(', ')}.`);
  }
  credit(userId, 'purchased', deeds, 'purchase', { mock_payment: true, usd_cents: deeds * rules.CENTS_PER_DEED });
}

// Holds draw free Deeds (Premium grants, referral credits) before purchased
// ones; the split is recorded on the hold so a release puts each Deed back in
// its own bucket and a forfeiture splits revenue by where it came from.
const placeHold = db.transaction((userId, bookingId, amount) => {
  const user = db.prepare('SELECT deeds_purchased, deeds_free FROM users WHERE id = ?').get(userId);
  if (user.deeds_purchased + user.deeds_free < amount) {
    throw new DeedsError('insufficient_deeds', `You need ${amount} Deeds available to confirm this shift.`, {
      needed: amount, available: user.deeds_purchased + user.deeds_free,
    });
  }
  const fromFree = Math.min(user.deeds_free, amount);
  const fromPurchased = amount - fromFree;
  const holdId = require('node:crypto').randomBytes(16).toString('hex');
  db.prepare(`
    INSERT INTO deeds_holds (id, user_id, booking_id, amount_purchased, amount_free, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'held', ?)
  `).run(holdId, userId, bookingId, fromPurchased, fromFree, clock.isoNow());
  if (fromFree) writeEntry(userId, { type: 'hold', bucket: 'free', available: -fromFree, held: fromFree, holdId, bookingId });
  if (fromPurchased) writeEntry(userId, { type: 'hold', bucket: 'purchased', available: -fromPurchased, held: fromPurchased, holdId, bookingId });
  return holdId;
});

// outcome: 'released' (cancel at no cost), 'returned' (attended) or
// 'forfeited' (no-show / late back-out). Forfeiture writes revenue rows for
// the shift's org (and the platform, for purchased Deeds only).
const resolveHold = db.transaction((holdId, outcome, reason, orgId) => {
  const hold = db.prepare('SELECT * FROM deeds_holds WHERE id = ?').get(holdId);
  if (!hold || hold.status !== 'held') return null;
  const now = clock.isoNow();
  db.prepare('UPDATE deeds_holds SET status = ?, reason = ?, resolved_at = ? WHERE id = ?').run(outcome, reason, now, holdId);

  const ledgerType = { released: 'release', returned: 'return', forfeited: 'forfeit' }[outcome];
  for (const [bucket, amount] of [['free', hold.amount_free], ['purchased', hold.amount_purchased]]) {
    if (!amount) continue;
    writeEntry(hold.user_id, {
      type: ledgerType, bucket, held: -amount,
      available: outcome === 'forfeited' ? 0 : amount,
      holdId, bookingId: hold.booking_id, meta: { reason },
    });
  }

  if (outcome === 'forfeited') {
    const month = monthKey(clock.now());
    const addRevenue = (recipient, bucket, cents) => {
      if (cents <= 0) return;
      db.prepare(`
        INSERT INTO forfeiture_revenue (hold_id, org_id, recipient, source_bucket, amount_cents, payout_month, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(holdId, orgId, recipient, bucket, cents, month, now);
    };
    const purchasedCents = hold.amount_purchased * rules.CENTS_PER_DEED;
    const purchasedToOrg = Math.round((purchasedCents * rules.ORG_SHARE_OF_PURCHASED_PCT) / 100);
    addRevenue('org', 'purchased', purchasedToOrg);
    addRevenue('platform', 'purchased', purchasedCents - purchasedToOrg);
    const freeCents = hold.amount_free * rules.CENTS_PER_DEED;
    const freeToOrg = Math.round((freeCents * rules.ORG_SHARE_OF_FREE_PCT) / 100);
    addRevenue('org', 'free', freeToOrg);
    addRevenue('platform', 'free', freeCents - freeToOrg);
  }
  return outcome;
});

function history(userId, limit = 50) {
  return db.prepare(`
    SELECT entry_type, bucket, available_delta, held_delta, booking_id, meta, created_at
    FROM deeds_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?
  `).all(userId, limit).map((row) => ({ ...row, meta: row.meta ? JSON.parse(row.meta) : null }));
}

// Ledger/column consistency check, used by the tests.
function auditUser(userId) {
  const sums = db.prepare(`
    SELECT bucket, COALESCE(SUM(available_delta), 0) AS available, COALESCE(SUM(held_delta), 0) AS held
    FROM deeds_ledger WHERE user_id = ? GROUP BY bucket
  `).all(userId);
  const by = Object.fromEntries(sums.map((r) => [r.bucket, r]));
  const user = db.prepare('SELECT deeds_purchased, deeds_free, deeds_balance FROM users WHERE id = ?').get(userId);
  const b = balances(userId);
  return {
    ok: (by.purchased?.available ?? 0) === user.deeds_purchased
      && (by.free?.available ?? 0) === user.deeds_free
      && user.deeds_balance === user.deeds_purchased + user.deeds_free
      && (by.purchased?.held ?? 0) + (by.free?.held ?? 0) === b.held,
    ledger: by,
    columns: user,
    held: b.held,
  };
}

module.exports = {
  DeedsError, shiftPriceDeeds, setShiftPriceDeeds, balances, credit, purchase, placeHold, resolveHold, history, auditUser,
};
