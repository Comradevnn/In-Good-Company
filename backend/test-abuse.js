// Abuse-resistance limits: per-account sliding-window limits on chat
// messages, safety reports, Deeds purchases and Premium subscribe (429
// rate_limited once a burst passes the limit, normal use untouched, one
// account's burst doesn't affect another); over-long chat refused; repeated
// reports by one person never pause the reported user; a Premium subscribe
// replay is refused rather than stacked; over-long free-text profile fields
// refused. Own server on :3050 with RATE_LIMIT on, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('abuse');
const { check, api } = h;
const rules = require('./lib/rules');

const L = rules.ABUSE_LIMITS;

// Repeats `send` until it answers 429, returning how many calls were let
// through (not 429) and the 429 response. Gives up a little past the limit.
async function burst(send, maxCalls) {
  let allowed = 0;
  for (let i = 0; i < maxCalls; i++) {
    const res = await send();
    if (res.status === 429) return { allowed, limited: res };
    allowed++;
  }
  return { allowed, limited: null };
}

async function main() {
  const { server } = await h.startServer({ RATE_LIMIT: 'on' });
  const db = require('./db');
  const reliability = require('./lib/reliability');
  try {
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const a = await h.makeVolunteer({ name: 'Ada', deeds: 5 });
    const b = await h.makeVolunteer({ name: 'Bo', deeds: 5 });
    const c = await h.makeVolunteer({ name: 'Cy' });
    await h.makeShift(org, { daysAhead: 3 });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    await h.confirmPairing(a, pid);
    await h.confirmPairing(b, pid);
    const say = (v, body) => api(`/pairings/${pid}/messages`, { method: 'POST', token: v.token, body: { body } });

    // ── Chat ──
    let used = 0; // attempts counted against a's chat window
    const ok1 = await say(a, 'hello there'); used++;
    check('normal chat message is accepted', ok1.status === 201, ok1.body);
    const long = await say(a, 'x'.repeat(rules.CHAT_MESSAGE_MAX_CHARS + 1)); used++;
    check('over-long chat message refused with 400 message_too_long', long.status === 400 && long.body.code === 'message_too_long', long.body);
    const atMax = await say(a, 'y'.repeat(rules.CHAT_MESSAGE_MAX_CHARS)); used++;
    check('a message exactly at the maximum is accepted', atMax.status === 201, atMax.body);
    const empty = await say(a, '   '); used++;
    check('blank chat message refused with 400 message_empty', empty.status === 400 && empty.body.code === 'message_empty', empty.body);
    const chat = await burst(() => say(a, 'burst'), L.chat_message.limit + 5);
    check('chat burst is cut off with 429 rate_limited exactly at the limit', chat.limited?.body?.code === 'rate_limited' && chat.allowed + used === L.chat_message.limit, { allowed: chat.allowed, used });
    const other = await say(b, 'still here');
    check("one account's chat limit does not affect their partner", other.status === 201, other.body);

    // ── Safety reports ──
    const report = (v, extra = {}) => api('/safety/reports', { method: 'POST', token: v.token, body: { category: 'inappropriate_messages', pairing_id: pid, ...extra } });
    let reportHits = 0;
    for (let i = 0; i < 3; i++) {
      const r = await report(a); reportHits++;
      check(`report ${i + 1} from one person is accepted`, r.status === 201, r.body);
    }
    const bRow = () => db.prepare('SELECT account_review FROM users WHERE id = ?').get(b.id);
    check('repeated reports from the same person never pause the reported user',
      !reliability.reviewReasons(b.id).includes('safety_reports') && !bRow().account_review);
    // Control: a second, different reporter tips the same count over.
    db.prepare("INSERT INTO safety_reports (id, reporter_user_id, reported_user_id, category, created_at) VALUES ('abuse-ctl', ?, ?, 'inappropriate_messages', ?)")
      .run(c.id, b.id, new Date().toISOString());
    await report(a); reportHits++;
    check('…while a second distinct reporter does pause them', reliability.reviewReasons(b.id).includes('safety_reports'));
    const rep = await burst(() => report(a, { category: 'not_a_category' }), L.safety_report.limit + 5);
    check('report burst is cut off with 429 rate_limited exactly at the limit', rep.limited?.body?.code === 'rate_limited' && rep.allowed + reportHits === L.safety_report.limit, { allowed: rep.allowed, reportHits });
    const bReport = await api('/safety/reports', { method: 'POST', token: b.token, body: { category: 'not_a_category' } });
    check("one account's report limit does not affect another account", bReport.status === 400, bReport.body);

    // ── Deeds purchases ──
    const pack = rules.PURCHASE_PACKS[0];
    const buy = (v) => api('/deeds/purchase', { method: 'POST', token: v.token, body: { deeds: pack } });
    const p1 = await buy(c);
    const p2 = await buy(c);
    check('two identical rapid purchases both succeed', p1.status === 200 && p2.status === 200, [p1.body, p2.body]);
    const ledger = db.prepare("SELECT COUNT(*) AS n FROM deeds_ledger WHERE user_id = ? AND entry_type = 'purchase'").get(c.id).n;
    check('…and are recorded as two separate purchases', ledger === 2 && p2.body.balances.available_purchased === pack * 2, { ledger, balances: p2.body.balances });
    const bad = await api('/deeds/purchase', { method: 'POST', token: c.token, body: { deeds: pack + 1 } });
    check('an invalid pack is still refused (400 invalid_pack)', bad.status === 400 && bad.body.code === 'invalid_pack', bad.body);
    const deedsBurst = await burst(() => buy(c), L.deeds_purchase.limit + 5);
    check('purchase burst is cut off with 429 rate_limited exactly at the limit', deedsBurst.limited?.body?.code === 'rate_limited' && deedsBurst.allowed + 3 === L.deeds_purchase.limit, { allowed: deedsBurst.allowed });
    const bal = db.prepare('SELECT deeds_purchased FROM users WHERE id = ?').get(c.id).deeds_purchased;
    check('only the purchases let through were credited', bal === pack * (2 + deedsBurst.allowed), bal);

    // ── Premium subscribe ──
    const d = await h.makeVolunteer({ name: 'Di' });
    const sub = (plan = 'monthly') => api('/premium/subscribe', { method: 'POST', token: d.token, body: { plan } });
    const subCount = () => db.prepare('SELECT COUNT(*) AS n FROM premium_subscriptions WHERE user_id = ?').get(d.id).n;
    const s1 = await sub();
    check('first subscribe succeeds', s1.status === 200 && s1.body.period_end, s1.body);
    const s2 = await sub();
    check('a repeat subscribe is refused with 409 already_subscribed', s2.status === 409 && s2.body.code === 'already_subscribed', s2.body);
    const s3 = await sub('annual');
    check('…even for a different plan, and nothing is stacked', s3.status === 409 && subCount() === 1 && db.prepare('SELECT premium_until FROM users WHERE id = ?').get(d.id).premium_until === s1.body.period_end);
    const s4 = await sub('bogus');
    check('an unknown plan is still refused as invalid_plan', s4.status === 400 && s4.body.code === 'invalid_plan', s4.body);
    await h.advance({ days: 120 });
    const s5 = await sub();
    check('subscribing again after the paid period has ended works (renewal)', s5.status === 200 && subCount() === 2, s5.body);
    const subBurst = await burst(() => sub(), L.premium_subscribe.limit + 5);
    check('subscribe burst is cut off with 429 rate_limited exactly at the limit', subBurst.limited?.body?.code === 'rate_limited' && subBurst.allowed + 5 === L.premium_subscribe.limit, { allowed: subBurst.allowed });

    // ── Free-text profile fields (lengths enforced by POST /users) ──
    const e = await h.makeVolunteer({ name: 'Eve' });
    const profile = (extra) => api('/users', { method: 'POST', token: e.token, body: { first_name: 'Eve', age: 27, gender: 'Female', occupation: 'Designer', hobbies: 'hiking', blurb: 'Hi.', ...extra } });
    const maxed = await profile({ occupation: 'o'.repeat(80), blurb: 'b'.repeat(300), personal_values: 'v'.repeat(300) });
    check('a profile at the maximum lengths is accepted', maxed.status === 200 || maxed.status === 201, maxed.body);
    const refusals = {
      'over-long occupation': { occupation: 'o'.repeat(81) },
      'over-long blurb': { blurb: 'b'.repeat(301) },
      'over-long values': { personal_values: 'v'.repeat(301) },
      'over-long hobbies': { hobbies: 'h'.repeat(201) },
      'too many hobbies': { hobbies: 'a,b,c,d,e,f' },
      'a single over-long hobby': { hobbies: 'h'.repeat(31) },
      'over-long name': { first_name: 'n'.repeat(41) },
      'non-string blurb': { blurb: { nested: 'x'.repeat(10) } },
    };
    for (const [label, extra] of Object.entries(refusals)) {
      const res = await profile(extra);
      check(`profile with ${label} is refused (400)`, res.status === 400, res.body);
    }
    const stored = db.prepare('SELECT occupation, bio FROM users WHERE id = ?').get(e.id);
    check('refused writes leave the stored profile unchanged', stored.occupation.length === 80 && stored.bio.length === 300);
  } finally {
    h.cleanup(server);
    h.summary();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
