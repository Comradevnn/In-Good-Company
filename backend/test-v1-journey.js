// Full-journey trace over HTTP, exactly as the mobile app calls it:
// onboarding -> wait -> pairing -> chat -> shift day -> rating -> next search,
// once for a free-tier volunteer (real onboarding calls) and once for a
// Premium (trial) volunteer, plus the branches that must never leave someone
// without a next step: a partner backing out after the grace window, a solo
// RSVP from the waiting alternatives, a search that runs out, an org-cancelled
// shift, a proposal that expires, and the monthly cap (free vs Premium).
//
// At every step the check is the same: what GET /me/home gives the person
// maps onto something mobile/screens/HomeScreen.js renders and that has a way
// forward. `surfaces()` below mirrors that screen's card order; if the screen's
// rules change, this mirror is what to update.
// Own server on :3050, own throwaway database. Product numbers come from lib/rules.js.
const h = require('./test-helpers');
const rules = require('./lib/rules');
const { localDate, addDays } = require('./lib/time');

h.useTempDb('v1-journey');
const { check, api } = h;

const STAMP = Date.now().toString(36);

// What HomeScreen draws for a given /me/home payload, in the screen's own
// order: one status card (a decision only the person can make comes first),
// the cap card or the "find your next shift" call to action, and the list of
// upcoming bookings.
function surfaces(home) {
  const out = [];
  const has = (type) => home.actions.some((a) => a.type === type);
  let primary = null;
  if (has('bail_decision')) primary = 'bail_decision';
  else if (has('proposal')) primary = 'proposal';
  else if (home.bookings.some((b) => b.is_today && !b.ended && b.status === 'confirmed')) primary = 'today';
  else if (has('rate')) primary = 'rate';
  else if (has('awaiting_partner')) primary = 'awaiting_partner';
  else if (home.request?.status === 'searching') primary = 'searching';
  else if (home.request?.status === 'no_match') primary = 'no_match';
  else if (!home.profile.verified) primary = 'verify';
  if (primary) out.push(primary);
  const open = ['searching', 'proposed'].includes(home.request?.status);
  const canSearch = !open && home.profile.verified && !home.matching_block;
  if (home.matching_block) out.push('matching_block');
  if (canSearch && home.premium.cap.used >= home.premium.cap.cap) out.push('cap_reached');
  if (canSearch && home.premium.cap.used < home.premium.cap.cap) out.push('find_next');
  if (home.bookings.some((b) => !(b.is_today && !b.ended))) out.push('upcoming');
  return out;
}

const SCREEN = {
  verify: 'VerifyIdScreen',
  searching: 'WaitingScreen',
  no_match: 'WaitingScreen (no-match options)',
  proposal: 'PairingScreen (confirm/decline)',
  awaiting_partner: 'PairingScreen (waiting on partner)',
  today: 'PairingScreen / BookingScreen',
  rate: 'RatingScreen',
  bail_decision: 'BailDecisionScreen',
  matching_block: 'Home warning card',
  cap_reached: 'Home cap card -> PremiumScreen / DeedsScreen',
  find_next: 'Home call to action -> StartMatchingScreen',
  upcoming: 'Home Upcoming card -> PairingScreen / BookingScreen',
};

const rows = [];

async function atStep(journey, label, vol, expect = []) {
  const home = await h.home(vol);
  const s = surfaces(home);
  const wanted = [].concat(expect);
  check(`[${journey}] ${label}: home offers ${wanted.length ? wanted.join(' + ') : 'a next step'}`,
    s.length > 0 && wanted.every((w) => s.includes(w)), { surfaces: s });
  rows.push([journey, label, s.join(' + ') || 'NOTHING', s.map((x) => SCREEN[x]).join(' ; ')]);
  return home;
}

const notesOf = async (v) => (await api('/notifications', { token: v.token })).body.notifications;
const noteKind = async (v, kind) => (await notesOf(v)).find((n) => n.kind === kind);
const balances = async (v) => (await api('/deeds', { token: v.token })).body;
const asArray = (v) => (typeof v === 'string' ? JSON.parse(v) : v) ?? [];

async function main() {
  const { server } = await h.startServer();
  const db = require('./db');
  try {
    const isolate = () => {
      db.prepare("UPDATE shifts SET status = 'cancelled' WHERE status = 'open'").run();
      db.prepare("UPDATE availability_requests SET status = 'cancelled' WHERE status = 'searching'").run();
    };
    const bookingOf = (pid, userId) => db.prepare(`
      SELECT b.* FROM bookings b JOIN pairings p ON (p.booking_a_id = b.id OR p.booking_b_id = b.id) WHERE p.id = ? AND b.user_id = ?
    `).get(pid, userId);
    const vol = (name, opts = {}) => h.makeVolunteer({ name, deeds: 25, ...opts });

    // The monthly cap counts calendar months, so start early in one: a journey
    // that runs across a month end would change what "used" means mid-test.
    const today0 = localDate(new Date(await h.serverNow()));
    if (Number(today0.slice(8)) > 10) {
      const [y, m] = today0.split('-').map(Number);
      const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      await h.advance({ to: new Date(Date.parse(`${first}T20:00:00Z`)).toISOString() });
    }

    const org = await h.makeOrg({ name: 'Journey Animal Haven', mission_tags: ['Animal welfare'] });

    // One shift's whole life for two people: wait, proposal, confirm, chat,
    // shift day, check-in, ratings. A looks first. `checkIn` lists who the org
    // checks in; anyone left out is resolved by the 24-hour auto-resolution.
    async function runShift(J, A, B, { daysAhead = 3, checkIn = ['A', 'B'] } = {}) {
      isolate();
      const shift = await h.makeShift(org, { daysAhead, title: `${J} shift` });

      // Wait
      const r1 = await h.startLooking(A);
      check(`[${J}] starting a search answers "searching" with a reason`, r1.status === 201 && r1.body.status === 'searching' && Boolean(r1.body.reason), r1.body);
      const cur = (await api('/requests/current', { token: A.token })).body.request;
      check(`[${J}] the waiting screen has a headline, a detail and a stop date`,
        cur.status === 'searching' && Boolean(cur.headline) && Boolean(cur.detail) && Boolean(cur.search_deadline), cur);
      check(`[${J}] while waiting, a solo spot is offered as an alternative`, cur.alternatives.some((a) => a.type === 'solo_rsvp'), cur.alternatives);
      await atStep(J, 'waiting for a partner', A, 'searching');

      // Proposal
      const r2 = await h.startLooking(B);
      check(`[${J}] the second person's search is proposed straight away`, r2.body.status === 'proposed', r2.body);
      const pid = await h.proposalFor(A);
      const homeA = await atStep(J, 'a proposal arrived', A, 'proposal');
      const proposalAction = homeA.actions.find((a) => a.type === 'proposal');
      check(`[${J}] the proposal action says who, when and until when`,
        proposalAction.partner_name === B.name && Boolean(proposalAction.when_label) && Date.parse(proposalAction.expires_at) > Date.parse(homeA.now), proposalAction);
      const proposalNote = await noteKind(A, 'proposal');
      check(`[${J}] a proposal notification points at the pairing`, proposalNote?.ref_type === 'pairing' && proposalNote.ref_id === pid, proposalNote);
      const curA = (await api('/requests/current', { token: A.token })).body.request;
      check(`[${J}] the waiting screen hands over to the pairing`, curA.status === 'proposed' && curA.proposal_pairing_id === pid, curA);

      // Confirm
      const noAck = await api(`/pairings/${pid}/confirm`, { method: 'POST', token: A.token, body: {} });
      check(`[${J}] a first confirm needs the safety notice acknowledged`, noAck.status === 409 && noAck.body.code === 'safety_notice_required', noAck.body);
      const c1 = await h.confirmPairing(A, pid);
      check(`[${J}] confirming holds the Deeds and waits on the partner`, c1.status === 200 && c1.body.me_confirmed && !c1.body.partner_confirmed, c1.body);
      const held = (await h.home(A)).deeds;
      check(`[${J}] the shift price is held`, held.held === held.shift_price, held);
      await atStep(J, 'confirmed, waiting for the partner', A, 'awaiting_partner');
      const nudged = await noteKind(B, 'partner_confirmed');
      check(`[${J}] the partner is told, with a link to the pairing`, nudged?.ref_type === 'pairing' && nudged.ref_id === pid, nudged);
      await atStep(J, 'partner still has to decide', B, 'proposal');
      const c2 = await h.confirmPairing(B, pid);
      check(`[${J}] both confirmed: the pairing is on`, c2.body.status === 'confirmed', c2.body);
      const paired = await noteKind(A, 'pairing_confirmed');
      check(`[${J}] "you're paired" points at the pairing`, paired?.ref_type === 'pairing' && paired.ref_id === pid, paired);
      const homePaired = await atStep(J, 'paired, shift upcoming', A, 'upcoming');
      check(`[${J}] the upcoming card names the partner and a confirmed pairing`,
        homePaired.bookings.some((b) => b.pairing?.status === 'confirmed' && b.pairing.partner_name === B.name), homePaired.bookings);

      // Chat
      const detail = (await api(`/pairings/${pid}`, { token: A.token })).body;
      check(`[${J}] chat is open on the pairing`, detail.chat_open === true && detail.chat_closed_reason === null, detail);
      const msgs = (await api(`/pairings/${pid}/messages`, { token: A.token })).body.messages;
      check(`[${J}] the chat opens with an introduction about the partner`, msgs.some((m) => m.kind === 'intro' && m.body.includes(B.name)), msgs);
      const sent = await api(`/pairings/${pid}/messages`, { method: 'POST', token: A.token, body: { body: 'Looking forward to it!' } });
      check(`[${J}] a message sends and the partner sees it`, sent.status === 201
        && (await api(`/pairings/${pid}/messages`, { token: B.token })).body.messages.some((m) => m.from === 'them' && m.body === 'Looking forward to it!'));
      const blocked = await api(`/pairings/${pid}/messages`, { method: 'POST', token: A.token, body: { body: 'call me on 408-555-0100' } });
      check(`[${J}] contact details are held back until both opt in`, blocked.status === 422 && blocked.body.code === 'contact_info_blocked', blocked.body);
      await api(`/pairings/${pid}/contact-share`, { method: 'POST', token: A.token, body: { opt_in: true } });
      const oneWay = await api(`/pairings/${pid}`, { token: B.token });
      check(`[${J}] the partner sees that the other side opted in`, oneWay.body.contact_share.partner === true && oneWay.body.contact_share.me === false, oneWay.body.contact_share);
      await api(`/pairings/${pid}/contact-share`, { method: 'POST', token: B.token, body: { opt_in: true } });
      const shared = await api(`/pairings/${pid}/messages`, { method: 'POST', token: A.token, body: { body: 'call me on 408-555-0100' } });
      check(`[${J}] after opting in both ways, contact details can be shared`, shared.status === 201, shared.body);

      // Shift day
      await h.advance({ to: shift.starts_at });
      await h.advance({ minutes: 1 });
      await atStep(J, 'shift day', A, 'today');
      const starters = (await api(`/pairings/${pid}/messages`, { token: A.token })).body.messages.filter((m) => m.kind === 'starter');
      check(`[${J}] a conversation starter arrives when the shift begins`, starters.length >= 1, starters);
      const roster = (await api(`/orgs/mine/shifts/${shift.id}/roster`, { token: org.token })).body.roster;
      const idA = roster.find((r) => r.first_name === A.name).booking_id;
      const idB = roster.find((r) => r.first_name === B.name).booking_id;
      if (checkIn.includes('A')) {
        const ci = await api(`/orgs/mine/bookings/${idA}/check-in`, { method: 'POST', token: org.token });
        check(`[${J}] the org checks the first volunteer in`, ci.body.status === 'attended', ci.body);
        const note = await noteKind(A, 'checked_in');
        check(`[${J}] the check-in notification points at the booking`, note?.ref_type === 'booking' && note.ref_id === idA, note);
        await atStep(J, 'checked in, shift still running', A);
      }
      if (checkIn.includes('B')) await api(`/orgs/mine/bookings/${idB}/check-in`, { method: 'POST', token: org.token });

      // Shift over
      await h.advance({ to: shift.ends_at });
      await h.advance({ minutes: 1 });
      if (checkIn.includes('A')) {
        const homeRate = await atStep(J, 'shift over, checked in', A, 'rate');
        const rate = homeRate.actions.find((a) => a.type === 'rate');
        check(`[${J}] the rate action names the org and links the booking`, rate.booking_id === idA && rate.org_name === org.name, rate);
        await api(`/orgs/mine/bookings/${idA}/rate`, { method: 'POST', token: org.token, body: { attendance: 5, contribution: 4 } });
        const form = (await api(`/bookings/${idA}/rating-form`, { token: A.token })).body;
        check(`[${J}] the rating form is open, names the partner, shows the org's rating`,
          form.can_rate && form.partner?.display_name === B.name && form.org_rating_of_you != null, form);
        const rated = await api(`/bookings/${idA}/ratings`, { method: 'POST', token: A.token, body: { org_operational: 5, personal_fit: 4, partner_showed_up: true, volunteer_again: true } });
        check(`[${J}] rating the org (two axes) and the partner is accepted`, rated.status === 200 && rated.body.became_buddies === false, rated.body);
        const again = await api(`/bookings/${idA}/ratings`, { method: 'POST', token: A.token, body: { org_operational: 5, personal_fit: 4 } });
        check(`[${J}] rating twice is refused with a code`, again.status === 409 && again.body.code === 'already_rated', again.body);
      }
      if (!checkIn.includes('B')) {
        const unresolved = await atStep(J, 'shift over, org has not marked this person yet', B);
        check(`[${J}] before auto-resolution the booking is still listed and not rateable`,
          unresolved.bookings.some((b) => b.booking_id === idB && b.ended) && !unresolved.actions.some((a) => a.type === 'rate'), unresolved.actions);
        await h.advance({ hours: rules.ATTENDANCE_AUTO_RESOLVE_MS / (60 * 60 * 1000), minutes: 1 });
      }
      const homeB = await atStep(J, 'partner: shift over', B, 'rate');
      const rateNote = await noteKind(B, 'rate_shift');
      check(`[${J}] "how did it go?" points at the booking`, rateNote?.ref_type === 'booking' && rateNote.ref_id === idB, rateNote);
      void homeB;
      const rB = await api(`/bookings/${idB}/ratings`, { method: 'POST', token: B.token, body: { org_operational: 4, personal_fit: 5, partner_showed_up: true, volunteer_again: true } });
      check(`[${J}] both said yes: they become buddies`, rB.status === 200 && rB.body.became_buddies === true, rB.body);
      const buddyNote = await noteKind(A, 'buddy_formed');
      check(`[${J}] the first rater is told about the new buddy`, Boolean(buddyNote), buddyNote);
      const homeDone = await atStep(J, 'rated, next search open', A, 'find_next');
      check(`[${J}] home lists the buddy and no rating is left to do`,
        homeDone.buddies.some((b) => b.display_name === B.name) && !homeDone.actions.some((a) => a.type === 'rate'), homeDone.buddies);
      check(`[${J}] no search is open after the shift`, (await api('/requests/current', { token: A.token })).body.request === null);
      await atStep(J, 'partner rated, next search open', B, 'find_next');
      return { pid, shift };
    }

    // ═══ Free-tier volunteer: real onboarding, then the whole journey ═══
    {
      const J = 'free';
      const email = `freya-${STAMP}@example.com`;
      const signup = await api('/auth/signup', { method: 'POST', body: { email, password: 'testpassword1' } });
      check(`[${J}] signup returns a session`, signup.status === 201 && Boolean(signup.body.session_token), signup.body);
      const token = signup.body.session_token;
      const F = { token, name: 'Freya' };
      check(`[${J}] the session is an individual account`, (await api('/auth/me', { token })).body.kind === 'individual');
      check(`[${J}] no profile yet: the app starts at the profile step`, (await api('/users/me', { token })).status === 404);
      const profile = await api('/users', {
        method: 'POST', token,
        body: { first_name: 'Freya', age: 31, occupation: 'Teacher', gender: 'Female', hobbies: 'baking, hiking', blurb: 'Happy to help.', personal_values: 'Kindness' },
      });
      check(`[${J}] quick profile saved`, profile.status === 201, profile.body);
      F.id = profile.body.id;
      // The signup trial is over for this person: age the account, as the other suites do.
      db.prepare("UPDATE accounts SET created_at = datetime(?, '-30 days') WHERE id = (SELECT account_id FROM users WHERE id = ?)")
        .run(new Date(await h.serverNow()).toISOString().replace('T', ' ').slice(0, 19), F.id);

      const loc = await api('/users/me', { method: 'PATCH', token, body: { location_city: 'San Jose, CA', location_lat: 37.34, location_lng: -121.89 } });
      check(`[${J}] location saved`, loc.status === 200 && loc.body.location_city === 'San Jose, CA', loc.body);
      const found = await api('/orgs?q=journey%20animal', { token });
      check(`[${J}] "I know an org": the directory finds it by name`, found.body.orgs.some((o) => o.id === org.id), found.body);
      const chose = await api('/users/me/preferred-org', { method: 'POST', token, body: { org_id: org.id } });
      check(`[${J}] choosing the org adds its cause`, chose.status === 200 && asArray(chose.body.cause_tags).includes('Animal welfare'), chose.body);
      const causes = await api('/users/me', { method: 'PATCH', token, body: { cause_tags: ['Animal welfare', 'Environmental cleanups'] } });
      check(`[${J}] at least two causes saved`, causes.status === 200 && asArray(causes.body.cause_tags).length >= 2, causes.body);
      const prefs = await api('/users/me', { method: 'PATCH', token, body: { gender_pref: 'any', seeking: 'friendship_only' } });
      check(`[${J}] partner preferences saved and marked as confirmed`, prefs.status === 200 && Boolean(prefs.body.partner_prefs_confirmed), prefs.body);
      const shiftDay = await h.serverDate(3);
      const weekday = new Date(`${shiftDay}T00:00:00Z`).getUTCDay();
      const avail = await api('/users/me', {
        method: 'PATCH', token,
        body: {
          availability_window_start: await h.serverDate(1), availability_window_end: await h.serverDate(10),
          travel_radius_miles: 15, volunteering_frequency: 'Twice a month', availability_weekdays: [weekday, (weekday + 1) % 7],
        },
      });
      check(`[${J}] availability saved with the chosen weekdays`,
        avail.status === 200 && asArray(avail.body.availability_weekdays).includes(weekday), avail.body);
      const me = (await api('/users/me', { token })).body;
      check(`[${J}] the profile carries everything the app's resume step needs to land on the home screen`,
        Boolean(me.location_city) && asArray(me.cause_tags).length >= 2 && Boolean(me.partner_prefs_confirmed)
        && Boolean(me.availability_window_start) && Boolean(me.availability_window_end), me);

      // Before verification
      const homeUnverified = await atStep(J, 'onboarded, ID not yet verified', F, 'verify');
      check(`[${J}] the unverified home says free plan, nothing to search with yet`,
        homeUnverified.premium.tier === 'free' && homeUnverified.deeds.available === 0 && !surfaces(homeUnverified).includes('find_next'), homeUnverified.premium);
      const early = await h.startLooking(F);
      check(`[${J}] searching before verifying is refused with a code the app maps to "Verify your ID"`, early.status === 409 && early.body.code === 'verification_incomplete', early.body);

      const dc = await api('/verification/document-check', { method: 'POST', token, body: { document_type: 'passport', issuing_country: 'US', document_number: `FREYA${STAMP}` } });
      check(`[${J}] the document check is not a duplicate`, dc.status === 200 && dc.body.duplicate === false, dc.body);
      const attest = await api('/verification/attest', { method: 'POST', token, body: { name_match: true, dob_match: true, doc_type_confirmed: true, dob_is_adult: true, expiry_date: '2035-01-01' } });
      check(`[${J}] attestation (adult confirmed on the device) verifies the account`, attest.status === 200, attest.body);
      check(`[${J}] /users/me now reports verified`, Number((await api('/users/me', { token })).body.verified) === 1);

      // Deeds
      await atStep(J, 'verified, no Deeds yet', F, 'find_next');
      const broke = await h.startLooking(F);
      check(`[${J}] with no Deeds, searching says how many are needed (the screen shows "Get Deeds")`,
        broke.status === 409 && broke.body.code === 'insufficient_deeds' && broke.body.needed === rules.DEFAULT_SHIFT_PRICE_DEEDS && broke.body.available === 0, broke.body);
      const buy = await api('/deeds/purchase', { method: 'POST', token, body: { deeds: rules.PURCHASE_PACKS[1] } });
      check(`[${J}] buying a pack credits the balance`, buy.status === 200 && buy.body.balances.available === rules.PURCHASE_PACKS[1], buy.body);

      const Pat = await vol('Pat', { lat: 37.35, lng: -121.9 });
      const first = await runShift(J, F, Pat, { checkIn: ['A'] });

      // Next search, with the buddy. Re-pick dates and weekdays as the edit screen does.
      isolate();
      await h.makeShift(org, { daysAhead: 3, title: 'free second shift' });
      const redo = await api('/users/me', {
        method: 'PATCH', token,
        body: { availability_window_start: await h.serverDate(1), availability_window_end: await h.serverDate(10), availability_weekdays: null },
      });
      check(`[${J}] the next search's dates and weekdays can be changed from home`, redo.status === 200 && redo.body.availability_weekdays == null, redo.body);
      const next = await h.startLooking(F, { extra: { buddy_user_id: Pat.id } });
      check(`[${J}] asking for the buddy again waits for them, and says so`, next.body.status === 'searching' && next.body.reason === 'waiting_for_buddy', next.body);
      const waitingBuddy = (await api('/requests/current', { token })).body.request;
      check(`[${J}] the waiting screen names the buddy and can open the search up`, waitingBuddy.buddy_name === 'Pat' && waitingBuddy.reason === 'waiting_for_buddy', waitingBuddy);
      await atStep(J, 'next search, waiting for the buddy', F, 'searching');
      const back = await h.startLooking(Pat, { extra: { buddy_user_id: F.id } });
      check(`[${J}] the buddy asks too: a pairing is proposed`, back.body.status === 'proposed', back.body);
      const pid2 = await h.proposalFor(F);
      await atStep(J, 'buddy proposal', F, 'proposal');
      await h.confirmPairing(F, pid2);
      await h.confirmPairing(Pat, pid2);

      // The cap
      const capHome = await atStep(J, 'second matched shift confirmed: free monthly cap reached', F, ['cap_reached', 'upcoming']);
      check(`[${J}] the cap state is the free plan's`, capHome.premium.tier === 'free' && capHome.premium.cap.cap === rules.FREE_MONTHLY_CAP && capHome.premium.cap.used === rules.FREE_MONTHLY_CAP, capHome.premium);
      const capped = await h.startLooking(F);
      check(`[${J}] a further search is refused with the cap code (home sends them to Premium)`, capped.status === 409 && capped.body.code === 'monthly_cap_reached', capped.body);
      const patHome = await atStep('premium', 'same point as the free cap: Premium has not hit its own', Pat, ['find_next', 'upcoming']);
      check('[premium] Premium at the free cap count is still under its own, higher cap',
        patHome.premium.cap.used === rules.FREE_MONTHLY_CAP && patHome.premium.cap.cap === rules.PREMIUM_MONTHLY_CAP && rules.PREMIUM_MONTHLY_CAP > rules.FREE_MONTHLY_CAP, patHome.premium);
      const patSearch = await h.startLooking(Pat);
      check('[premium] and can keep searching', patSearch.status === 201 && patSearch.body.status === 'searching', patSearch.body);
      await api('/requests/current/cancel', { method: 'POST', token: Pat.token });
      void first;
    }

    // ═══ Premium (signup trial) volunteer ═══
    {
      const J = 'premium';
      const Q = await vol('Quinn');
      const R = await vol('Robin');
      const homeQ = await atStep(J, 'verified, trial running', Q, 'find_next');
      check(`[${J}] the trial shows as Premium with its end date and the weekly grant`,
        homeQ.premium.tier === 'premium' && homeQ.premium.source === 'trial' && Boolean(homeQ.premium.trial_ends_at)
        && homeQ.deeds.available === rules.DEFAULT_SHIFT_PRICE_DEEDS * 5 + rules.PREMIUM_WEEKLY_GRANT, homeQ);
      await runShift(J, Q, R);
      const again = await h.startLooking(Q);
      check(`[${J}] the next search starts straight away`, again.status === 201 && again.body.status === 'searching', again.body);
      await atStep(J, 'next search open', Q, 'searching');
      await api('/requests/current/cancel', { method: 'POST', token: Q.token });
      await atStep(J, 'stopped looking', Q, 'find_next');
    }

    // ═══ Branch: a partner backs out after the grace window ═══
    {
      const J = 'backout';
      const X = await vol('BackX');
      const Y = await vol('BackY');
      isolate();
      const shift = await h.makeShift(org, { daysAhead: 3 });
      await h.startLooking(X);
      await h.startLooking(Y);
      const pid = await h.proposalFor(X);
      await h.confirmPairing(X, pid);
      await h.confirmPairing(Y, pid);
      await h.advance({ hours: 2 });
      const bx = bookingOf(pid, X.id);
      const preview = (await api(`/bookings/${bx.id}/cancel-preview`, { token: X.token })).body;
      check(`[${J}] two hours in is past the grace window`, preview.type !== 'grace', preview);
      const out = await api(`/bookings/${bx.id}/cancel`, { method: 'POST', token: X.token, body: {} });
      check(`[${J}] the cancellation goes through`, out.status === 200, out.body);
      await atStep(J, 'the one who backed out', X, 'find_next');
      const homeY = await atStep(J, 'backed out on: rematch or Deeds back', Y, ['bail_decision', 'upcoming']);
      const decision = homeY.actions.find((a) => a.type === 'bail_decision');
      check(`[${J}] the decision names who backed out and a deadline`, decision.partner_name === 'BackX' && Date.parse(decision.deadline) > Date.parse(homeY.now), decision);
      const decNote = await noteKind(Y, 'bail_decision');
      check(`[${J}] the notification opens the decision`, decNote?.ref_type === 'pairing' && decNote.ref_id === pid, decNote);
      const view = (await api(`/pairings/${pid}`, { token: Y.token })).body;
      check(`[${J}] the Deeds stay held while they decide`, view.bail.open === true && view.my_booking.hold.status === 'held', view.bail);
      const upcomingY = homeY.bookings.find((b) => b.pairing?.id === pid);
      check(`[${J}] the upcoming card says the partner can't make it`, upcomingY?.pairing.status === 'cancelled', upcomingY);

      const rem = await api(`/pairings/${pid}/bail-decision`, { method: 'POST', token: Y.token, body: { choice: 'rematch' } });
      check(`[${J}] "find me someone new" opens a search for the same shift`, rem.body.request?.kind === 'rematch' && rem.body.request.status === 'searching', rem.body);
      await atStep(J, 'rematch search running', Y, 'searching');
      const Z = await vol('BackZ');
      await h.startLooking(Z);
      const pid2 = await h.proposalFor(Z);
      check(`[${J}] a new partner is proposed for the same shift`, Boolean(pid2) && db.prepare('SELECT shift_id FROM pairings WHERE id = ?').get(pid2).shift_id === shift.id);
      await atStep(J, 'rematch proposal: already confirmed, waiting for the new partner', Y, 'awaiting_partner');
      await h.confirmPairing(Z, pid2);
      const yDone = await atStep(J, 'rematched and confirmed', Y, 'upcoming');
      check(`[${J}] the upcoming card names the new partner`, yDone.bookings.some((b) => b.pairing?.status === 'confirmed' && b.pairing.partner_name === 'BackZ'), yDone.bookings);

      // Choosing the Deeds back
      const X2 = await vol('BackX2');
      const Y2 = await vol('BackY2');
      isolate();
      await h.makeShift(org, { daysAhead: 3 });
      await h.startLooking(X2);
      await h.startLooking(Y2);
      const pid3 = await h.proposalFor(X2);
      await h.confirmPairing(X2, pid3);
      await h.confirmPairing(Y2, pid3);
      const beforeY2 = (await balances(Y2)).available + (await balances(Y2)).held;
      await h.advance({ hours: 2 });
      await api(`/bookings/${bookingOf(pid3, X2.id).id}/cancel`, { method: 'POST', token: X2.token, body: {} });
      await atStep(J, 'second case: backed out on', Y2, 'bail_decision');
      const rel = await api(`/pairings/${pid3}/bail-decision`, { method: 'POST', token: Y2.token, body: { choice: 'release' } });
      check(`[${J}] "give me my Deeds back" is accepted`, rel.status === 200 && rel.body.choice === 'release', rel.body);
      const afterY2 = await balances(Y2);
      check(`[${J}] every held Deed is back`, afterY2.held === 0 && afterY2.available === beforeY2, afterY2);
      await atStep(J, 'Deeds back, nothing booked', Y2, 'find_next');
      const closed = (await api(`/pairings/${pid3}`, { token: Y2.token })).body;
      check(`[${J}] the pairing screen shows a closed decision`, closed.bail.open === false && closed.bail.choice === 'release', closed.bail);

      // No answer in time
      const X3 = await vol('BackX3');
      const Y3 = await vol('BackY3');
      isolate();
      await h.makeShift(org, { daysAhead: 3 });
      await h.startLooking(X3);
      await h.startLooking(Y3);
      const pid4 = await h.proposalFor(X3);
      await h.confirmPairing(X3, pid4);
      await h.confirmPairing(Y3, pid4);
      await h.advance({ hours: 2 });
      await api(`/bookings/${bookingOf(pid4, X3.id).id}/cancel`, { method: 'POST', token: X3.token, body: {} });
      await h.advance({ hours: rules.BAIL_DECISION_MS / (60 * 60 * 1000), minutes: 5 });
      const silent = await noteKind(Y3, 'bail_released');
      check(`[${J}] no answer: they are told the Deeds are back`, Boolean(silent) && (await balances(Y3)).held === 0, silent);
      const homeY3 = await atStep(J, 'decision window ran out', Y3, 'find_next');
      check(`[${J}] no decision is left hanging`, !homeY3.actions.some((a) => a.type === 'bail_decision'), homeY3.actions);
      isolate();
    }

    // ═══ Branch: solo RSVP from the waiting alternatives ═══
    {
      const J = 'solo';
      isolate();
      const spot = await h.makeShift(org, { daysAhead: 4, capacity: 4, title: 'Solo spot shift' });
      const U = await vol('SoloU');
      await h.startLooking(U);
      const waiting = (await api('/requests/current', { token: U.token })).body.request;
      const alt = waiting.alternatives.find((a) => a.type === 'solo_rsvp');
      check(`[${J}] the waiting screen offers the shift to RSVP to`, Boolean(alt) && alt.shifts.some((s) => s.id === spot.id), waiting.alternatives);
      const rsvp = await api(`/shifts/${spot.id}/rsvp-solo`, { method: 'POST', token: U.token });
      check(`[${J}] RSVP books a solo spot with no Deeds held`, rsvp.status === 201 && rsvp.body.kind === 'solo' && (await balances(U)).held === 0, rsvp.body);
      const homeU = await atStep(J, 'solo spot booked, still looking for a partner', U, ['searching', 'upcoming']);
      check(`[${J}] the search is now tied to that shift and says so`,
        homeU.request.kind === 'solo_rsvp' && homeU.request.headline.includes('booked') && homeU.request.alternatives.length === 0, homeU.request);
      check(`[${J}] the upcoming card is a solo spot`, homeU.bookings.some((b) => b.booking_id === rsvp.body.booking_id && b.kind === 'solo' && !b.pairing), homeU.bookings);
      const stop = await api('/requests/current/cancel', { method: 'POST', token: U.token });
      check(`[${J}] "stop looking, I'll go solo" works`, stop.status === 200, stop.body);
      const homeStopped = await atStep(J, 'going solo', U, ['upcoming', 'find_next']);
      check(`[${J}] the solo spot is still booked`, homeStopped.bookings.some((b) => b.booking_id === rsvp.body.booking_id && b.status === 'confirmed'), homeStopped.bookings);
      const cancelPreview = (await api(`/bookings/${rsvp.body.booking_id}/cancel-preview`, { token: U.token })).body;
      check(`[${J}] cancelling a solo spot costs nothing`, cancelPreview.type === 'solo' && cancelPreview.deeds_outcome === 'none', cancelPreview);
      isolate();
    }

    // ═══ Branch: a search that runs out ═══
    {
      const J = 'no_match';
      isolate();
      const farShift = await h.makeShift(org, { daysAhead: 8, capacity: 4, title: 'Far shift' });
      const V = await vol('NoMatchV');
      await h.startLooking(V);
      const before = (await api('/requests/current', { token: V.token })).body.request;
      check(`[${J}] the search has a stop date within the waiting cap`, Date.parse(before.search_deadline) - Date.parse(before.created_at) <= rules.WAIT_CAP_MS, before);
      await h.advance({ hours: rules.WAIT_CAP_MS / (60 * 60 * 1000), minutes: 1 });
      const homeEnd = await atStep(J, 'search ran out', V, ['no_match', 'find_next']);
      const note = await noteKind(V, 'no_match');
      check(`[${J}] they are told, and the home card carries the next step`, Boolean(note) && homeEnd.request.status === 'no_match', note);
      const ended = (await api('/requests/current', { token: V.token })).body.request;
      check(`[${J}] the no-match screen offers ways to get matched`, ended.status === 'no_match' && ended.alternatives.length > 0, ended.alternatives);
      check(`[${J}] one of them is the shift that is still open`, ended.alternatives.some((a) => a.type === 'solo_rsvp' && a.shifts.some((s) => s.id === farShift.id)), ended.alternatives);

      const revived = await api('/requests/current/adjust', { method: 'POST', token: V.token, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(8), travel_radius_miles: 30 } });
      check(`[${J}] adjusting revives the same search`, revived.status === 200 && revived.body.request.status === 'searching', revived.body);
      await atStep(J, 'revived search', V, 'searching');

      await h.advance({ hours: rules.WAIT_CAP_MS / (60 * 60 * 1000), minutes: 1 });
      await atStep(J, 'ran out again', V, 'no_match');
      const dismiss = await api('/requests/current/dismiss', { method: 'POST', token: V.token });
      check(`[${J}] "search new dates" dismisses the old result`, dismiss.status === 200, dismiss.body);
      const homeAfter = await atStep(J, 'dismissed', V, 'find_next');
      check(`[${J}] nothing is left pending`, homeAfter.request === null, homeAfter.request);
      isolate();
    }

    // ═══ Branch: a proposal that expires ═══
    {
      const J = 'expiry';
      const P1 = await vol('ExpiryP1');
      const P2 = await vol('ExpiryP2');
      isolate();
      await h.makeShift(org, { daysAhead: 4 });
      await h.startLooking(P1);
      await h.startLooking(P2);
      const pid = await h.proposalFor(P1);
      await h.confirmPairing(P1, pid);
      await h.advance({ hours: rules.PROPOSAL_RESPONSE_MS / (60 * 60 * 1000), minutes: 1 });
      const lateConfirm = await h.confirmPairing(P2, pid);
      check(`[${J}] confirming after the deadline is refused with a code`, [409, 410].includes(lateConfirm.status) && ['expired', 'not_proposed'].includes(lateConfirm.body.code), lateConfirm.body);
      const homeP2 = await atStep(J, 'did not answer in time', P2, 'find_next');
      const expiredNote = await noteKind(P2, 'proposal_expired');
      check(`[${J}] they are told the search paused`, Boolean(expiredNote) && homeP2.request === null, expiredNote);
      const homeP1 = await atStep(J, 'confirmed, partner did not answer', P1, 'searching');
      const fell = await noteKind(P1, 'proposal_fell_through');
      check(`[${J}] the confirmed one is told, keeps searching and has no Deeds held`, Boolean(fell) && homeP1.deeds.held === 0, homeP1.deeds);
      isolate();
    }

    // ═══ Branch: the org cancels the shift ═══
    {
      const J = 'org_cancel';
      const G = await vol('CancelG');
      const H = await vol('CancelH');
      isolate();
      const shift = await h.makeShift(org, { daysAhead: 4 });
      const startBalance = await balances(G);
      await h.startLooking(G);
      await h.startLooking(H);
      const pid = await h.proposalFor(G);
      await h.confirmPairing(G, pid);
      await h.confirmPairing(H, pid);
      check(`[${J}] setup: the pair is confirmed with Deeds held`, (await balances(G)).held === rules.DEFAULT_SHIFT_PRICE_DEEDS);
      const cancel = await api(`/orgs/mine/shifts/${shift.id}/cancel`, { method: 'POST', token: org.token, body: { reason: 'Site closed' } });
      check(`[${J}] the org can cancel`, cancel.status === 200 && cancel.body.volunteers_notified === 2, cancel.body);
      const after = await balances(G);
      check(`[${J}] every Deed is back in full`, after.held === 0 && after.available === startBalance.available, after);
      const note = await noteKind(G, 'shift_cancelled');
      check(`[${J}] the notification points at starting a new search and never names the partner`,
        note?.ref_type === 'matching' && note.body.includes(org.name) && !note.body.includes('CancelH'), note);
      const homeG = await atStep(J, 'shift cancelled by the org', G, 'find_next');
      check(`[${J}] the cancelled booking is no longer listed and the cap is untouched`,
        homeG.bookings.length === 0 && homeG.premium.cap.used === 0 && !homeG.actions.some((a) => a.type === 'bail_decision'), homeG);
      const view = (await api(`/pairings/${pid}`, { token: G.token })).body;
      check(`[${J}] the pairing screen says the org cancelled and has no decision to make`, view.cancelled_by_org === true && view.bail === null, view);
      await atStep(J, 'the partner too', H, 'find_next');
      await h.makeShift(org, { daysAhead: 4, title: 'Replacement shift' });
      const fresh = await h.startLooking(G);
      check(`[${J}] a new search starts and is not matched back onto the cancelled shift`,
        fresh.status === 201 && db.prepare("SELECT COUNT(*) AS n FROM pairings WHERE shift_id = ? AND status IN ('proposed', 'confirmed')").get(shift.id).n === 0, fresh.body);
      await api('/requests/current/cancel', { method: 'POST', token: G.token });
      isolate();
    }

    // The journey table: step -> what /me/home offered -> which screen draws it.
    console.log('\nJOURNEY TABLE (journey | step | /me/home offered | mobile screen)');
    for (const r of rows) console.log(`  ${r.join(' | ')}`);
    void addDays;
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
