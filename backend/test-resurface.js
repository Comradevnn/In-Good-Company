// Resurfacing nudges: a quiet volunteer is told about new fitting shifts on a
// cadence set by their volunteering frequency. Covers the cadence per
// frequency label, one nudge per period, every "stay quiet" condition, the
// absence of other users' names, and that frequency never changes who
// matching pairs. Own server on :3050, own throwaway database; time moves
// only through the dev clock.
const h = require('./test-helpers');

h.useTempDb('resurface');
const { check, api } = h;
const rules = require('./lib/rules');
const { monthKey } = require('./lib/time');

const HOUR = 3600 * 1000;

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  const setUser = (vol, column, value) => db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(value, vol.id);
  const setFrequency = async (vol, label) => api('/users/me', { method: 'PATCH', token: vol.token, body: { volunteering_frequency: label } });
  const nudges = async (vol) => (await api('/notifications', { token: vol.token })).body.notifications.filter((n) => n.kind === 'resurface');

  try {
    const sanJose = { lat: 37.3382, lng: -121.8863 };
    const losAngeles = { lat: 34.0522, lng: -118.2437 };
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const s1 = await h.makeShift(org, { daysAhead: 9, ...sanJose });

    // One volunteer per frequency label, all with the same causes and place.
    const labels = ['Weekly', 'Three times a month', 'Twice a month', 'Once a month'];
    const byLabel = {};
    for (const label of labels) {
      const vol = await h.makeVolunteer({ name: `Cadence${label.split(' ')[0]}${label.length}`, ...sanJose });
      await setFrequency(vol, label);
      byLabel[label] = vol;
    }
    const weekly = byLabel.Weekly;
    check('every frequency label has a cadence', labels.every((l) => rules.RESURFACE_CADENCE_DAYS[l] > 0));
    check('weekly people are nudged more often than once-a-month people',
      rules.RESURFACE_CADENCE_DAYS.Weekly < rules.RESURFACE_CADENCE_DAYS['Once a month']);

    // Volunteers who must stay quiet for one reason each (all "Weekly").
    const quiet = {};
    const blocked = async (key, opts = {}) => {
      const vol = await h.makeVolunteer({ name: `Quiet${key}`, ...sanJose, ...opts });
      await setFrequency(vol, 'Weekly');
      quiet[key] = vol;
      return vol;
    };
    const searching = await blocked('Search');
    const booked = await blocked('Booked');
    const paused = await blocked('Paused');
    const review = await blocked('Review');
    const capped = await blocked('Capped');
    const noFit = await blocked('NoFit', { causes: ['Elder care'] });
    const far = await blocked('Far', { lat: losAngeles.lat, lng: losAngeles.lng, radius: 10 });
    const unverified = await blocked('Unverified', { verify: false });

    const farFuture = new Date((await h.serverNow()) + 100 * 24 * HOUR).toISOString();
    db.prepare(`
      INSERT INTO availability_requests (user_id, window_start, window_end, status, search_deadline, created_at)
      VALUES (?, ?, ?, 'searching', ?, ?)
    `).run(searching.id, '2030-01-01', '2030-01-10', farFuture, new Date().toISOString());
    const bookingRow = db.prepare(`
      INSERT INTO bookings (user_id, shift_id, kind, status, confirmed_at, created_at) VALUES (?, ?, 'solo', 'confirmed', ?, ?)
    `).run(booked.id, s1.id, new Date().toISOString(), new Date().toISOString());
    setUser(paused, 'matching_paused_until', farFuture);
    setUser(review, 'account_review', 1);

    // ── Nothing is due on day one, or just before the weekly cadence ──
    await h.tick();
    check('nobody is nudged the moment they join', (await nudges(weekly)).length === 0);
    await h.advance({ days: rules.RESURFACE_CADENCE_DAYS.Weekly - 1 });
    check('a weekly volunteer is not nudged before their cadence', (await nudges(weekly)).length === 0);

    // The monthly cap is counted per calendar month, so fill it for the month
    // the next tick lands in. New accounts are on a Premium trial, so fill the
    // larger cap.
    const target = (await h.serverNow()) + 25 * HOUR;
    const shiftForCap = db.prepare('SELECT id FROM shifts LIMIT 1').get().id;
    for (let i = 0; i < rules.PREMIUM_MONTHLY_CAP; i++) {
      db.prepare(`
        INSERT INTO bookings (user_id, shift_id, kind, status, cap_month, created_at) VALUES (?, ?, 'paired', 'cancelled', ?, ?)
      `).run(capped.id, shiftForCap, monthKey(new Date(target)), new Date().toISOString());
    }

    // ── Cadence honoured: weekly is nudged, the others are not yet ──
    await h.advance({ hours: 25 });
    const first = await nudges(weekly);
    check('a weekly volunteer is nudged once their cadence has passed', first.length === 1, first);
    check('the nudge points at finding a shift and names a count',
      first[0]?.ref_type === 'matching' && first[0]?.ref_id == null && /\b1 open shift\b/.test(first[0]?.body ?? ''), first[0]);
    for (const label of labels.slice(1)) {
      check(`"${label}" is not nudged at the weekly mark`, (await nudges(byLabel[label])).length === 0);
    }
    await h.tick();
    await h.tick();
    check('ticking again does not repeat the nudge within the period', (await nudges(weekly)).length === 1);

    // ── Every "stay quiet" condition ──
    const reasons = {
      Search: 'an open search', Booked: 'an upcoming booking', Paused: 'matching paused', Review: 'under review',
      Capped: 'the monthly cap reached', NoFit: 'no shift fitting their causes', Far: 'no shift within their distance',
      Unverified: 'not verified',
    };
    for (const [key, reason] of Object.entries(reasons)) {
      check(`no nudge with ${reason}`, (await nudges(quiet[key])).length === 0);
    }

    // ── The body never names another user ──
    const everyone = [...labels.map((l) => byLabel[l]), ...Object.values(quiet)];
    const text = JSON.stringify(first[0]);
    check('the nudge mentions no other user',
      everyone.filter((v) => v !== weekly).every((v) => !text.includes(v.name) && !text.includes(v.email)));

    // ── Later periods: one nudge per period, driven by the dev clock ──
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(bookingRow.lastInsertRowid);
    await h.advance({ days: 4 }); // day 11: past the 10-day cadence, but the only shift has started
    check('three-times-a-month volunteer waits for a shift that fits', (await nudges(byLabel['Three times a month'])).length === 0);
    await h.makeShift(org, { daysAhead: 3, ...sanJose });
    await h.advance({ hours: 2 }); // the pass runs at most once an hour, so let the next one come round
    check('three-times-a-month volunteer is nudged once a shift fits', (await nudges(byLabel['Three times a month'])).length === 1);
    check('the weekly volunteer is not nudged again mid-period', (await nudges(weekly)).length === 1);
    check('twice-a-month volunteer is still waiting', (await nudges(byLabel['Twice a month'])).length === 0);

    await h.advance({ days: 2, hours: 10 }); // day 13.4
    await h.makeShift(org, { daysAhead: 4, ...sanJose });
    await h.advance({ days: 1 }); // day 14.4: weekly's second period and the twice-a-month cadence both passed
    check('the weekly volunteer gets a second nudge in the next period', (await nudges(weekly)).length === 2);
    check('twice-a-month volunteer is nudged at their cadence', (await nudges(byLabel['Twice a month'])).length === 1);
    check('once-a-month volunteer is still waiting', (await nudges(byLabel['Once a month'])).length === 0);

    await h.advance({ days: 14 });
    await h.makeShift(org, { daysAhead: 4, ...sanJose });
    await h.advance({ days: 3 }); // past 30 days since joining
    check('once-a-month volunteer is nudged after a month', (await nudges(byLabel['Once a month'])).length === 1);
    check('a nudge is a notification only: the weekly volunteer has no search or booking from it',
      db.prepare("SELECT COUNT(*) AS n FROM availability_requests WHERE user_id = ?").get(weekly.id).n === 0);

    // ── Recent activity and the hourly throttle ──
    // Three weekly volunteers long past their cadence since joining: one
    // control, one whose shift just ended, one whose search just ended.
    const DAY_MS = 24 * HOUR;
    await h.makeShift(org, { daysAhead: 5, ...sanJose });
    const mkWeekly = async (name) => {
      const vol = await h.makeVolunteer({ name, ...sanJose });
      await setFrequency(vol, 'Weekly');
      return vol;
    };
    const control = await mkWeekly('Recentcontrol');
    const justWorked = await mkWeekly('Recentshift');
    const justSearched = await mkWeekly('Recentsearch');
    const lateJoin = await mkWeekly('Recentlate');
    const nowMs = await h.serverNow();
    const longAgo = new Date(nowMs - 60 * DAY_MS).toISOString();
    for (const vol of [control, justWorked, justSearched]) setUser(vol, 'created_at', longAgo);
    setUser(lateJoin, 'created_at', new Date(nowMs).toISOString()); // joined just now on the app clock
    const endedShift = await h.makeShift(org, { daysAhead: 3, ...sanJose });
    db.prepare('UPDATE shifts SET starts_at = ?, ends_at = ? WHERE id = ?')
      .run(new Date(nowMs - 3 * HOUR).toISOString(), new Date(nowMs - 30 * 60 * 1000).toISOString(), endedShift.id);
    db.prepare(`
      INSERT INTO bookings (user_id, shift_id, kind, status, confirmed_at, created_at) VALUES (?, ?, 'solo', 'confirmed', ?, ?)
    `).run(justWorked.id, endedShift.id, longAgo, longAgo);
    db.prepare(`
      INSERT INTO availability_requests (user_id, window_start, window_end, status, search_deadline, created_at, ended_at)
      VALUES (?, ?, ?, 'cancelled', ?, ?, ?)
    `).run(justSearched.id, '2030-01-01', '2030-01-10', longAgo, longAgo, new Date(nowMs - 30 * 60 * 1000).toISOString());
    await h.advance({ hours: 2 });
    check('a long-quiet volunteer is nudged', (await nudges(control)).length === 1);
    check('a volunteer whose confirmed shift just ended is not nudged', (await nudges(justWorked)).length === 0);
    check('a volunteer whose search just ended is not nudged', (await nudges(justSearched)).length === 0);

    // Within the hour a due nudge waits; the next hour's pass delivers it.
    setUser(lateJoin, 'created_at', longAgo);
    await h.tick();
    check('a pass inside the same hour is skipped, so a newly due nudge waits', (await nudges(lateJoin)).length === 0);
    await h.advance({ hours: 2 });
    check('the throttle does not stop a due nudge at the next hour\'s pass', (await nudges(lateJoin)).length === 1);

    // ── Frequency never changes who matching pairs ──
    db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
    db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
    const shift = await h.makeShift(org, { daysAhead: 5 });
    const pairOf = async (a, b) => {
      await h.startLooking(a);
      await h.startLooking(b);
      const pid = await h.proposalFor(a);
      const row = pid ? db.prepare('SELECT * FROM pairings WHERE id = ?').get(pid) : null;
      db.prepare("UPDATE pairings SET status = 'cancelled' WHERE id = ?").run(pid);
      db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status IN ('searching', 'proposed')").run();
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE pairing_id = ? AND status = 'proposed'").run(pid);
      return row;
    };
    const mk = async (name, label) => {
      const vol = await h.makeVolunteer({ name, deeds: 5 });
      await setFrequency(vol, label);
      return vol;
    };
    const p1 = await mk('Pairone', 'Weekly');
    const p2 = await mk('Pairtwo', 'Once a month');
    const q1 = await mk('Pairthree', 'Once a month');
    const q2 = await mk('Pairfour', 'Weekly');
    const first2 = await pairOf(p1, p2);
    const second2 = await pairOf(q1, q2);
    check('two volunteers with different frequencies are paired', first2 && [first2.user_a_id, first2.user_b_id].sort().join() === [p1.id, p2.id].sort().join(), first2);
    check('the same pairing forms with the frequencies swapped', second2 && [second2.user_a_id, second2.user_b_id].sort().join() === [q1.id, q2.id].sort().join(), second2);
    check('both land on the same shift regardless of frequency', first2?.shift_id === shift.id && second2?.shift_id === shift.id);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => { console.error(err); process.exit(1); });
