// Full volunteer journey, end to end over HTTP against a live server on
// :3050 (own throwaway database — see test-helpers.js):
// signup → onboarding → verification → Deeds → availability → waiting →
// proposal → confirm (hold) → chat → shift day (starters, check-in) →
// ratings → buddies → next availability. Also exercises the org side
// (listing, waiver, verification gate, roster, check-in, rating volunteers),
// share-my-plans, safety reporting and the metrics endpoints.
const h = require('./test-helpers');

h.useTempDb('journey');
const { check, api } = h;

async function main() {
  const { server } = await h.startServer();
  try {
    // ── Org side: an org lists a shift; it's invisible until verified ──
    const org = await h.makeOrg({ name: 'Journey Animal Haven', mission_tags: ['Animal welfare'], verified: false });
    const shift = await h.makeShift(org, { daysAhead: 3, capacity: 4, title: 'Dog socializing' });
    check('org can list a shift before verification', Boolean(shift.id));
    const orgView = await api('/orgs/mine', { token: org.token });
    check('org profile records the waiver and says shifts are hidden until verified',
      orgView.body.waiver?.kind === 'platform_default' && orgView.body.shifts_visible_to_volunteers === false, orgView.body);

    // ── Two volunteers sign up and onboard through the real routes ──
    const alex = await h.makeVolunteer({ name: 'Alex', gender: 'Female' });
    const jordan = await h.makeVolunteer({ name: 'Jordan', gender: 'Male', occupation: 'Nurse' });
    const alexHome0 = await h.home(alex);
    check('new user is on the Premium trial', alexHome0.premium.tier === 'premium' && alexHome0.premium.source === 'trial', alexHome0.premium);
    check('trial includes the weekly Deeds grant (credited at signup)', alexHome0.deeds.available === 2, alexHome0.deeds);
    const visible0 = await api('/shifts', { token: alex.token });
    check("unverified org's shift is not visible to volunteers", !visible0.body.shifts.some((s) => s.id === shift.id));

    // Not enough Deeds yet to start looking.
    const early = await h.startLooking(alex);
    check('starting a search without enough Deeds is refused with a clear code', early.status === 409 && early.body.code === 'insufficient_deeds', early.body);
    for (const v of [alex, jordan]) await api('/deeds/purchase', { method: 'POST', token: v.token, body: { deeds: 5 } });

    // Org gets verified by an admin → shift becomes visible.
    await api(`/admin/orgs/${org.id}/verify`, { method: 'POST', admin: true, body: { verified: true } });
    const visible1 = await api('/shifts', { token: alex.token });
    check('verified org\'s shift becomes visible', visible1.body.shifts.some((s) => s.id === shift.id));
    const evening = await h.makeShift(org, { daysAhead: 5, start_time: '18:00', end_time: '21:00', title: 'Evening walk' });
    const listed = (await api('/shifts', { token: alex.token })).body.shifts;
    check('a morning shift is tagged daytime, an evening one is not',
      listed.find((s) => s.id === shift.id)?.daytime === true && listed.find((s) => s.id === evening.id)?.daytime === false);
    await api(`/admin/orgs/${org.id}/verify`, { method: 'POST', admin: true, body: { verified: true } });

    // ── Waiting period ──
    const req1 = await h.startLooking(alex);
    check('Alex starts looking → searching with an honest status', req1.status === 201 && req1.body.status === 'searching', req1.body);
    check('waiting status explains what is missing (no partner yet)', req1.body.reason === 'no_compatible_partner_in_radius', req1.body.reason);
    check('alternatives are offered while waiting (solo RSVP)', req1.body.alternatives.some((a) => a.type === 'solo_rsvp'), req1.body.alternatives);

    const req2 = await h.startLooking(jordan);
    check('Jordan starts looking → immediately proposed with Alex', req2.body.status === 'proposed', req2.body);

    // ── Proposal: see the specific shift, nothing held yet ──
    const pairingId = await h.proposalFor(alex);
    const proposal = await api(`/pairings/${pairingId}`, { token: alex.token });
    check('proposal shows the specific shift (org, cause, when, where)',
      proposal.body.shift.org_name === 'Journey Animal Haven' && proposal.body.shift.when_label && proposal.body.shift.location_label, proposal.body.shift);
    check('proposal shows the partner card with verification status', proposal.body.partner.display_name === 'Jordan' && proposal.body.partner.verified === true);
    check('partner card carries no contact details or reliability', !('email' in proposal.body.partner) && !('reliability_score' in proposal.body.partner));
    const before = await h.home(alex);
    check('no Deeds held before confirming', before.deeds.held === 0, before.deeds);

    const noAck = await api(`/pairings/${pairingId}/confirm`, { method: 'POST', token: alex.token, body: {} });
    check('first confirm requires the pre-first-shift safety notice', noAck.status === 409 && noAck.body.code === 'safety_notice_required');
    const c1 = await h.confirmPairing(alex, pairingId);
    check('Alex confirms → 5 Deeds held, waiting on Jordan', c1.status === 200 && c1.body.me_confirmed && !c1.body.partner_confirmed && c1.body.status === 'proposed', c1.body);
    const alexAfter = await h.home(alex);
    check('hold moved Deeds from available to held', alexAfter.deeds.held === 5 && alexAfter.deeds.available === 2, alexAfter.deeds);
    const c2 = await h.confirmPairing(jordan, pairingId);
    check('Jordan confirms → pairing confirmed', c2.body.status === 'confirmed', c2.body.status);

    // ── Chat ──
    const msgs = await api(`/pairings/${pairingId}/messages`, { token: alex.token });
    const intro = msgs.body.messages.find((m) => m.kind === 'intro');
    check('chat opens with an auto-sent warm intro about the partner', intro && intro.body.includes('Jordan') && intro.body.includes('Journey Animal Haven'), intro);
    check('each side only sees the intro about the other person', msgs.body.messages.filter((m) => m.kind === 'intro').length === 1);
    const sent = await api(`/pairings/${pairingId}/messages`, { method: 'POST', token: alex.token, body: { body: 'hey! excited for this' } });
    check('text messages send', sent.status === 201);
    const phone = await api(`/pairings/${pairingId}/messages`, { method: 'POST', token: alex.token, body: { body: 'text me at 408-555-0199' } });
    check('contact info is blocked without mutual opt-in', phone.status === 422 && phone.body.code === 'contact_info_blocked');
    await api(`/pairings/${pairingId}/contact-share`, { method: 'POST', token: alex.token, body: { opt_in: true } });
    const stillBlocked = await api(`/pairings/${pairingId}/messages`, { method: 'POST', token: alex.token, body: { body: 'insta: alex_vols' } });
    check('one-sided opt-in still blocks contact info', stillBlocked.status === 422);
    await api(`/pairings/${pairingId}/contact-share`, { method: 'POST', token: jordan.token, body: { opt_in: true } });
    const allowed = await api(`/pairings/${pairingId}/messages`, { method: 'POST', token: alex.token, body: { body: 'insta: alex_vols' } });
    check('after both opt in, contact info can be shared', allowed.status === 201);
    const jordanSees = await api(`/pairings/${pairingId}/messages`, { token: jordan.token });
    check('partner receives messages (polling)', jordanSees.body.messages.some((m) => m.from === 'them' && m.body === 'hey! excited for this'));

    // ── Share my plans + safety notice ──
    const plan = await api(`/pairings/${pairingId}/share-plan`, { token: alex.token });
    check('share-my-plans payload has time, place and partner\'s verified first name',
      plan.body.message.includes('Journey Animal Haven') && plan.body.message.includes('Jordan') && plan.body.message.includes('ID-verified'), plan.body.message);

    // ── Shift day ──
    await h.advance({ to: shift.starts_at });
    await h.advance({ minutes: 1 });
    const roster = await api(`/orgs/mine/shifts/${shift.id}/roster`, { token: org.token });
    check('org roster lists both volunteers by first name with verified badge',
      roster.body.roster.length === 2 && roster.body.roster.every((r) => r.verified_badge) && roster.body.roster.every((r) => !('email' in r)), roster.body.roster);
    const starters = (await api(`/pairings/${pairingId}/messages`, { token: alex.token })).body.messages.filter((m) => m.kind === 'starter');
    check('a conversation starter arrives in-app when the shift starts', starters.length === 1, starters);
    const alexBooking = roster.body.roster.find((r) => r.first_name === 'Alex').booking_id;
    const jordanBooking = roster.body.roster.find((r) => r.first_name === 'Jordan').booking_id;
    const ci = await api(`/orgs/mine/bookings/${alexBooking}/check-in`, { method: 'POST', token: org.token });
    check('org checks Alex in → attended', ci.body.status === 'attended', ci.body);
    await api(`/orgs/mine/bookings/${jordanBooking}/check-in`, { method: 'POST', token: org.token });
    const afterCheckin = await h.home(alex);
    check('attendance returns the held Deeds in full', afterCheckin.deeds.held === 0 && afterCheckin.deeds.available === 7, afterCheckin.deeds);
    await h.advance({ hours: 2 });
    const later = (await api(`/pairings/${pairingId}/messages`, { token: alex.token })).body.messages.filter((m) => m.kind === 'starter');
    check('more starters are spread across the shift (no more than three)', later.length >= 2 && later.length <= 3, later.length);
    const midShift = await h.home(alex);
    check('no rating prompt until the shift is over', !midShift.actions.some((a) => a.type === 'rate'));
    await h.advance({ hours: 1 });

    // ── Ratings ──
    const alexHome = await h.home(alex);
    const rateAction = alexHome.actions.find((a) => a.type === 'rate');
    check('home shows a "rate your shift" action after the shift', Boolean(rateAction), alexHome.actions);
    await api(`/orgs/mine/bookings/${alexBooking}/rate`, { method: 'POST', token: org.token, body: { attendance: 5, contribution: 4 } });
    const form = await api(`/bookings/${alexBooking}/rating-form`, { token: alex.token });
    check("the org's rating of you is visible to you", form.body.org_rating_of_you?.contribution === 'leaning good', form.body);
    const r1 = await api(`/bookings/${alexBooking}/ratings`, { method: 'POST', token: alex.token, body: { org_operational: 5, personal_fit: 4, partner_showed_up: true, volunteer_again: true } });
    check('Alex rates the org (two axes) and Jordan', r1.status === 200 && r1.body.became_buddies === false, r1.body);
    const r2 = await api(`/bookings/${jordanBooking}/ratings`, { method: 'POST', token: jordan.token, body: { org_operational: 4, personal_fit: 5, partner_showed_up: true, volunteer_again: true } });
    check('both said yes → they become buddies', r2.body.became_buddies === true, r2.body);
    const buddies = await api('/buddies', { token: alex.token });
    check('buddy list shows Jordan', buddies.body.buddies.some((b) => b.display_name === 'Jordan'), buddies.body);

    // ── Metrics ──
    const mine = await api('/metrics/me', { token: alex.token });
    check('user metrics: one shift, hours, one org', mine.body.shifts_completed === 1 && mine.body.hours === 2.5 && mine.body.orgs === 1, mine.body);
    const orgMetrics = await api('/orgs/mine/metrics', { token: org.token });
    check('org metrics: turnout 100%, both new to org, hours',
      orgMetrics.body.turnout.turnout_pct === 100 && orgMetrics.body.new_to_org_pct === 100 && orgMetrics.body.volunteer_hours === 5, orgMetrics.body);
    const platform = await api('/admin/metrics', { admin: true });
    check('platform metrics: wait time and density are reported', platform.body.avg_wait_hours_to_confirmed_pairing !== undefined && platform.body.cause_density_by_metro, platform.body);

    // ── Next availability: rebook with the buddy ──
    const shift2 = await h.makeShift(org, { daysAhead: 4, capacity: 4, title: 'Dog walking' });
    void shift2;
    const n1 = await h.startLooking(alex, { extra: { buddy_user_id: jordan.id } });
    check('next availability: Alex asks to go with buddy Jordan → waits for Jordan', n1.body.status === 'searching' && n1.body.reason === 'waiting_for_buddy', n1.body);
    const n2 = await h.startLooking(jordan, { extra: { buddy_user_id: alex.id } });
    check('Jordan asks for Alex too → buddy pairing proposed', n2.body.status === 'proposed', n2.body);
    const buddyPairing = await api(`/pairings/${await h.proposalFor(jordan)}`, { token: jordan.token });
    check('buddy pairing is marked as such', buddyPairing.body.origin === 'buddy');

    // ── Safety report ──
    const report = await api('/safety/reports', { method: 'POST', token: jordan.token, body: { category: 'other', description: 'test report', pairing_id: pairingId } });
    check('safety report is stored for human review', report.status === 201);
    const reports = await api('/admin/safety-reports', { admin: true });
    check('admin sees the open report', reports.body.reports.some((r) => r.status === 'open' && r.reported_name === 'Alex'));
    const buddiesAfter = await api('/buddies', { token: alex.token });
    check('a report ends the buddyship (reports override buddy status)', buddiesAfter.body.buddies.length === 0, buddiesAfter.body);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
