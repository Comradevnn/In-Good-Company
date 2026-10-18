// Referral codes and credits. A referrer earns free Deeds when someone who
// signed up with their code completes ID verification — so a second account
// made with the same document (already blocked by duplicate-document
// detection) can never earn a self-referral credit. Credits are rate-limited
// per referrer; referrals over the limit simply earn nothing.
const crypto = require('node:crypto');
const db = require('../db');
const clock = require('./clock');
const rules = require('./rules');
const deeds = require('./deeds');
const { notify } = require('./notify');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function ensureCode(user) {
  if (user.referral_code) return user.referral_code;
  for (;;) {
    const code = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
    try {
      db.prepare('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL').run(code, user.id);
      return db.prepare('SELECT referral_code FROM users WHERE id = ?').get(user.id).referral_code;
    } catch (err) {
      if (!String(err.message).includes('UNIQUE')) throw err;
    }
  }
}

// Called when the profile row is first created: links the code the account
// signed up with (accounts.referral_code_used) to the referrer.
function linkReferrer(userId, code) {
  if (!code) return;
  const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(String(code).trim().toUpperCase());
  if (!referrer || referrer.id === userId) return;
  db.prepare('UPDATE users SET referred_by_user_id = ? WHERE id = ? AND referred_by_user_id IS NULL').run(referrer.id, userId);
}

// Called after a successful ID verification. Evaluated once per referred user.
function creditOnVerification(userId) {
  const user = db.prepare('SELECT id, display_name, referred_by_user_id, referral_credited_at FROM users WHERE id = ?').get(userId);
  if (!user?.referred_by_user_id || user.referral_credited_at) return false;
  db.prepare('UPDATE users SET referral_credited_at = ? WHERE id = ?').run(clock.isoNow(), user.id);
  const last = db.prepare(`
    SELECT MAX(created_at) AS t FROM deeds_ledger WHERE user_id = ? AND entry_type = 'referral'
  `).get(user.referred_by_user_id).t;
  if (last && clock.nowMs() - clock.parseTime(last) < rules.REFERRAL_COOLDOWN_MS) return false;
  deeds.credit(user.referred_by_user_id, 'free', rules.REFERRAL_DEEDS, 'referral', { referred_user_id: user.id });
  notify(user.referred_by_user_id, 'referral_credit', 'A friend joined', `${user.display_name} finished signing up with your link — you earned ${rules.REFERRAL_DEEDS} Deed.`);
  return true;
}

function summary(user) {
  const earned = db.prepare(`
    SELECT COALESCE(SUM(available_delta), 0) AS n FROM deeds_ledger WHERE user_id = ? AND entry_type = 'referral'
  `).get(user.id).n;
  const joined = db.prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by_user_id = ?').get(user.id).n;
  return { code: ensureCode(user), friends_joined: joined, deeds_earned: earned, deeds_per_friend: rules.REFERRAL_DEEDS };
}

module.exports = { ensureCode, linkReferrer, creditOnVerification, summary };
