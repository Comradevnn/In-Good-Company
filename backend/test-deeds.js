// The Deeds ledger and Premium: mock purchases, hold-on-confirm, release on
// grace cancel, forfeiture on late back-out / no-show with both revenue
// splits (purchased vs granted Deeds, and a mixed hold), return on
// attendance, the monthly cap (free and Premium), the signup trial boundary,
// the weekly grant, Premium's penalty-free late cancel,
// referral credits (rate limit + self-referral via a duplicate document),
// platform repricing, the no-show escalation, and ledger/column consistency.
// Own server on :3050, own throwaway database.
const crypto = require('node:crypto');
const h = require('./test-helpers');

h.useTempDb('deeds');
const { check, api } = h;

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const deedsLib = require('./lib/deeds');
  const allUsers = [];
  const vol = async (opts) => {
    const v = await h.makeVolunteer(opts);
    allUsers.push(v);
    return v;
  };
  // A volunteer whose trial is long over and who has only purchased Deeds.
  const freeTierVol = async (opts = {}) => {
    const v = await vol({ ...opts, deeds: undefined });
    db.prepare("UPDATE accounts SET created_at = datetime(?, '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)")
      .run(new Date(await h.serverNow()).toISOString().replace('T', ' ').slice(0, 19), v.id);
    if (opts.deeds) await api('/deeds/purchase', { method: 'POST', token: v.token, body: { deeds: opts.deeds } });
    return v;
  };
  const balances = async (v) => (await api('/deeds', { token: v.token })).body;
  const isolate = () => {
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
  };
  const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
  const pairOn = async (a, b, daysAhead = 3) => {
    isolate();
    const shift = await h.makeShift(org, { daysAhead });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    if (!pid) throw new Error('expected a proposal');
    const ca = await h.confirmPairing(a, pid);
    const cb = await h.confirmPairing(b, pid);
    return { pid, shift, ca, cb };
  };
  const revenueFor = (pairingId, userId) => {
    const holdId = db.prepare(`
      SELECT b.hold_id FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id)
      WHERE p.id = ? AND b.user_id = ?
    `).get(pairingId, userId).hold_id;
    return db.prepare('SELECT recipient, source_bucket, amount_cents FROM forfeiture_revenue WHERE hold_id = ? ORDER BY recipient, source_bucket').all(holdId);
  };
  const myBooking = (pairingId, userId) => db.prepare(`
    SELECT b.* FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id) WHERE p.id = ? AND b.user_id = ?
  `).get(pairingId, userId);

  try {
    // ── Purchases (mock) ──
    const p1 = await freeTierVol();
    const bad = await api('/deeds/purchase', { method: 'POST', token: p1.token, body: { deeds: 7 } });
    check('only the fixed packs can be bought', bad.status === 400 && bad.body.code === 'invalid_pack');
    for (const n of [5, 25, 50]) await api('/deeds/purchase', { method: 'POST', token: p1.token, body: { deeds: n } });
    const b1 = await balances(p1);
    check('packs of 5/25/50 add to the purchased bucket', b1.available === 80 && b1.available_purchased === 80 && b1.available_free === 0, b1);
    check('purchases are logged as mock payments (no card data)', b1.history[0].meta.mock_payment === true && !JSON.stringify(b1.history).match(/card/i));

    // ── Hold on confirm, release on grace-window cancel ──
    const g1 = await freeTierVol({ deeds: 5 });
    const g2 = await vol({ deeds: 5 });
    isolate();
    const shiftG = await h.makeShift(org, { daysAhead: 3 });
    void shiftG;
    await h.startLooking(g1);
    await h.startLooking(g2);
    const pidG = await h.proposalFor(g1);
    check('a proposal holds nothing', (await balances(g1)).held === 0);
    await h.confirmPairing(g1, pidG);
    check('confirming holds the shift price', (await balances(g1)).held === 5 && (await balances(g1)).available === 0);
    await h.confirmPairing(g2, pidG);
    const bookingG1 = myBooking(pidG, g1.id);
    const prevG = await api(`/bookings/${bookingG1.id}/cancel-preview`, { token: g1.token });
    check('cancel preview inside the grace window says "released"', prevG.body.type === 'grace' && prevG.body.deeds_outcome === 'released', prevG.body);
    await api(`/bookings/${bookingG1.id}/cancel`, { method: 'POST', token: g1.token, body: {} });
    const g1After = await balances(g1);
    check('grace cancel releases the hold in full', g1After.available === 5 && g1After.held === 0, g1After);
    check('a grace cancel does not count toward the monthly cap', (await api('/premium', { token: g1.token })).body.cap.used === 0);
    check('a grace cancel is logged as on-time (not a late cancel)',
      db.prepare('SELECT kind FROM reliability_events WHERE user_id = ?').all(g1.id).map((r) => r.kind).join() === 'grace_cancel');
    const g2Home = await h.home(g2);
    check('the partner is offered the "your match can\'t make it" choice', g2Home.actions.some((a) => a.type === 'bail_decision'), g2Home.actions);

    // ── Late back-out: purchased Deeds forfeited, split org/platform ──
    const l1 = await freeTierVol({ deeds: 5 });
    const l2 = await vol({ deeds: 5 });
    const late = await pairOn(l1, l2);
    await h.advance({ hours: 2 });
    const bookingL1 = myBooking(late.pid, l1.id);
    const prevL = await api(`/bookings/${bookingL1.id}/cancel-preview`, { token: l1.token });
    check('past the grace window (free tier) the preview says "forfeited"', prevL.body.type === 'late' && prevL.body.deeds_outcome === 'forfeited', prevL.body);
    await api(`/bookings/${bookingL1.id}/cancel`, { method: 'POST', token: l1.token, body: {} });
    const l1After = await balances(l1);
    check('late back-out forfeits the held Deeds', l1After.available === 0 && l1After.held === 0, l1After);
    const revL = revenueFor(late.pid, l1.id);
    check('purchased-Deed forfeiture is split between org and platform per the spec ratio',
      JSON.stringify(revL) === JSON.stringify([{ recipient: 'org', source_bucket: 'purchased', amount_cents: 400 }, { recipient: 'platform', source_bucket: 'purchased', amount_cents: 100 }]), revL);
    check('a late back-out still counts toward the cap', (await api('/premium', { token: l1.token })).body.cap.used === 1);
    check('the backed-out-on partner is not charged', (await balances(l2)).held === 5 && (await balances(l2)).available >= 0);

    // ── Mixed hold (free first, then purchased) → no-show ──
    const m1 = await vol({ deeds: 5 }); // trial: 2 granted + 5 purchased
    const m2 = await vol({ deeds: 5 });
    const mixed = await pairOn(m1, m2, 4);
    const holdM = db.prepare('SELECT amount_free, amount_purchased FROM deeds_holds WHERE id = ?').get(myBooking(mixed.pid, m1.id).hold_id);
    check('a hold draws granted Deeds before purchased ones', holdM.amount_free === 2 && holdM.amount_purchased === 3, holdM);
    await h.advance({ to: mixed.shift.starts_at });
    await h.advance({ minutes: 5 });
    await api(`/orgs/mine/bookings/${myBooking(mixed.pid, m1.id).id}/no-show`, { method: 'POST', token: org.token });
    await api(`/orgs/mine/bookings/${myBooking(mixed.pid, m2.id).id}/check-in`, { method: 'POST', token: org.token });
    const revM = revenueFor(mixed.pid, m1.id);
    const orgCents = revM.filter((r) => r.recipient === 'org').reduce((s, r) => s + r.amount_cents, 0);
    const platformCents = revM.filter((r) => r.recipient === 'platform').reduce((s, r) => s + r.amount_cents, 0);
    check('mixed no-show: granted part all to org, purchased part split per the spec ratio', orgCents === 440 && platformCents === 60, revM);
    const m2After = await balances(m2);
    check('the partner who attended gets their Deeds back', m2After.held === 0 && m2After.available === 7, m2After);
    const m1Notes = (await api('/notifications', { token: m1.token })).body.notifications.map((n) => n.kind);
    check('first no-show → a reminder, not a pause', m1Notes.includes('reliability_reminder') && !(await h.home(m1)).matching_block, m1Notes);

    // Escalation: a second recent no-show pauses matching; a third → review.
    // (Same escalate() path the org's no-show route uses, called directly so
    // this suite doesn't need two more full pairings; the test process's
    // clock is aligned with the server's first.)
    const clockLib = require('./lib/clock');
    clockLib.advance((await h.serverNow()) - clockLib.nowMs());
    const reliabilityLib = require('./lib/reliability');
    reliabilityLib.record(m1.id, 'no_show');
    const paused = await h.startLooking(m1);
    check('a second recent no-show → matching paused (clear code)', paused.status === 409 && paused.body.code === 'matching_paused', paused.body);
    reliabilityLib.record(m1.id, 'no_show');
    const review = await h.startLooking(m1);
    check('a third → account review', review.status === 409 && review.body.code === 'account_review', review.body);
    await api(`/admin/users/${m1.id}/clear-review`, { method: 'POST', admin: true });
    check('an admin can clear the review', !(await h.home(m1)).matching_block);
    check('reliability score is never shown in the partner card', !JSON.stringify((await api(`/pairings/${mixed.pid}`, { token: m2.token })).body.partner).includes('reliab'));

    // ── Monthly cap: free tier ──
    const cap = await freeTierVol({ deeds: 25 });
    for (let i = 0; i < 2; i++) {
      const partner = await vol({ deeds: 5 });
      await pairOn(cap, partner, 3 + i);
    }
    const capState = (await api('/premium', { token: cap.token })).body;
    check('free tier: matched shifts are counted against the free cap', capState.tier === 'free' && capState.cap.used === 2 && capState.cap.cap === 2, capState.cap);
    const third = await h.startLooking(cap);
    check('a third matched shift in the month is refused (upgrade prompt code)', third.status === 409 && third.body.code === 'monthly_cap_reached', third.body);

    // Premium fair-use ceiling.
    const prem = await vol({ deeds: 5 });
    await api('/premium/subscribe', { method: 'POST', token: prem.token, body: { plan: 'monthly' } });
    const { monthKey } = require('./lib/time');
    const month = monthKey(new Date(await h.serverNow()));
    const someShift = db.prepare('SELECT id FROM shifts LIMIT 1').get().id;
    const addCapRows = (userId, n) => {
      for (let i = 0; i < n; i++) {
        db.prepare("INSERT INTO bookings (id, user_id, shift_id, kind, status, cap_month, created_at) VALUES (?, ?, ?, 'paired', 'attended', ?, ?)")
          .run(crypto.randomBytes(8).toString('hex'), userId, someShift, month, new Date().toISOString());
      }
    };
    addCapRows(prem.id, 14);
    isolate();
    await h.makeShift(org, { daysAhead: 5 });
    const under = await h.startLooking(prem);
    check('Premium at 14 matched shifts can still search', under.status === 201, under.body);
    await api('/requests/current/cancel', { method: 'POST', token: prem.token });
    addCapRows(prem.id, 1);
    const over = await h.startLooking(prem);
    check('Premium is capped at its fair-use ceiling', over.status === 409 && over.body.code === 'monthly_cap_reached', over.body);

    // ── Platform repricing applies to new holds ──
    await api('/admin/settings/shift-price', { method: 'POST', admin: true, body: { deeds: 6 } });
    const r1 = await freeTierVol({ deeds: 25 });
    const r2 = await vol({ deeds: 25 });
    const repriced = await pairOn(r1, r2, 6);
    check('a new shift price applies to new holds', db.prepare('SELECT amount_purchased + amount_free AS n FROM deeds_holds WHERE id = ?').get(myBooking(repriced.pid, r1.id).hold_id).n === 6);
    await api('/admin/settings/shift-price', { method: 'POST', admin: true, body: { deeds: 5 } });

    // ── Referrals ──
    const referrer = await freeTierVol();
    const code = (await api('/referral', { token: referrer.token })).body.code;
    const before = (await balances(referrer)).available;
    const friendDoc = `REFDOC${Date.now()}`;
    await vol({ referral_code: code, doc: friendDoc });
    check('a friend who signs up with the link and verifies earns the referrer a Deed', (await balances(referrer)).available === before + 1);
    check('referral Deeds are free (granted-style) Deeds', (await balances(referrer)).available_free === 1);
    await vol({ referral_code: code });
    check('referral credit is rate-limited', (await balances(referrer)).available === before + 1);
    // Self-referral with a second account and the SAME document: duplicate
    // detection stops verification, and credit is only earned at verification.
    await h.advance({ days: 8 });
    const dup = await api('/auth/signup', { method: 'POST', body: { email: `dup-${Date.now()}@example.com`, password: 'testpassword1', referral_code: code } });
    await api('/users', { method: 'POST', token: dup.body.session_token, body: { first_name: 'Dup', age: 30, gender: 'Male' } });
    const dupCheck = await api('/verification/document-check', { method: 'POST', token: dup.body.session_token, body: { document_type: 'passport', issuing_country: 'US', document_number: friendDoc } });
    const dupAttest = await api('/verification/attest', { method: 'POST', token: dup.body.session_token, body: { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2035-01-01' } });
    check('a second account with the same document cannot verify', dupCheck.body.duplicate === true && dupAttest.status !== 200, { dupCheck: dupCheck.body, attest: dupAttest.status });
    check('…so a self-referral earns nothing, even after the weekly limit resets', (await balances(referrer)).available === before + 1);
    await vol({ referral_code: code });
    check('after the rate limit resets, the next verified referral earns again', (await balances(referrer)).available === before + 2);

    // ── Trial boundary (day 14) and the weekly grant ──
    const t = await vol();
    const nowMs = await h.serverNow();
    const created = new Date(nowMs - 14 * 86400000 + 3600000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('UPDATE accounts SET created_at = ? WHERE id = (SELECT account_id FROM users WHERE id = ?)').run(created, t.id);
    check('an hour before the trial boundary: still on the trial', (await api('/premium', { token: t.token })).body.source === 'trial');
    await h.advance({ hours: 1, minutes: 1 });
    check('at the trial boundary: trial over, free tier', (await api('/premium', { token: t.token })).body.tier === 'free');

    const w = await vol();
    check('weekly grant: credited at the start of the trial', (await balances(w)).available === 2);
    await h.advance({ days: 7 });
    check('weekly grant: credited again a week later', (await balances(w)).available === 4);
    await h.advance({ days: 7 });
    check('no grant once the trial has ended (unsubscribed)', (await balances(w)).available === 4);
    await api('/premium/subscribe', { method: 'POST', token: w.token, body: { plan: 'monthly' } });
    check('subscribing restarts the weekly grant', (await balances(w)).available === 6);

    // ── Granted Deeds forfeited → all to the org ──
    await h.advance({ days: 7 });
    check('grants keep coming weekly while subscribed', (await balances(w)).available === 8);
    const wPartner = await vol({ deeds: 5 });
    const granted = await pairOn(w, wPartner, 3);
    const holdW = db.prepare('SELECT amount_free, amount_purchased FROM deeds_holds WHERE id = ?').get(myBooking(granted.pid, w.id).hold_id);
    check('a Premium user with only granted Deeds holds granted Deeds', holdW.amount_free === 5 && holdW.amount_purchased === 0, holdW);
    await h.advance({ to: granted.shift.starts_at });
    await h.advance({ minutes: 5 });
    await api(`/orgs/mine/bookings/${myBooking(granted.pid, w.id).id}/no-show`, { method: 'POST', token: org.token });
    const revW = revenueFor(granted.pid, w.id);
    check('granted-Deed forfeiture goes 100% to the org, nothing to the platform',
      JSON.stringify(revW) === JSON.stringify([{ recipient: 'org', source_bucket: 'free', amount_cents: 500 }]), revW);

    // ── Premium's penalty-free late cancel ──
    const pc = await vol({ deeds: 25 });
    await api('/premium/subscribe', { method: 'POST', token: pc.token, body: { plan: 'annual' } });
    const c1 = await pairOn(pc, await vol({ deeds: 5 }), 3);
    await h.advance({ hours: 2 });
    const pv1 = await api(`/bookings/${myBooking(c1.pid, pc.id).id}/cancel-preview`, { token: pc.token });
    check('Premium: the first late cancel in a month is penalty-free', pv1.body.type === 'free_late' && pv1.body.deeds_outcome === 'released', pv1.body);
    const before1 = (await balances(pc)).available;
    await api(`/bookings/${myBooking(c1.pid, pc.id).id}/cancel`, { method: 'POST', token: pc.token, body: {} });
    check('…and releases the hold', (await balances(pc)).available === before1 + 5);
    check('…with no reliability ding', db.prepare("SELECT COUNT(*) AS n FROM reliability_events WHERE user_id = ? AND kind = 'late_cancel'").get(pc.id).n === 0);
    const c2 = await pairOn(pc, await vol({ deeds: 5 }), 3);
    await h.advance({ hours: 2 });
    const pv2 = await api(`/bookings/${myBooking(c2.pid, pc.id).id}/cancel-preview`, { token: pc.token });
    check('Premium: the next late cancel in the same month forfeits', pv2.body.type === 'late' && pv2.body.deeds_outcome === 'forfeited', pv2.body);
    // Next calendar month: the free late cancel is available again.
    const { localDate, zonedToUtc } = require('./lib/time');
    const [y, mo] = localDate(new Date(await h.serverNow())).split('-').map(Number);
    const firstOfNext = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    await h.advance({ to: zonedToUtc(firstOfNext, 12).toISOString() });
    check('the penalty-free late cancel resets the next month', (await api('/premium', { token: pc.token })).body.free_late_cancel_available === true);

    // ── Ledger consistency for every user touched ──
    const bad2 = allUsers.map((u) => ({ email: u.email, audit: deedsLib.auditUser(u.id) })).filter((r) => !r.audit.ok);
    check(`ledger sums equal the balance columns for all ${allUsers.length} users`, bad2.length === 0, bad2);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
