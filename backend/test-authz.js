// Access control, response shape, input validation and hardening:
//   - every volunteer route rejects a missing token;
//   - one user can't read or act on another user's pairings or bookings;
//   - volunteers can't use org routes and orgs can't touch each other's shifts;
//   - profile responses never include internal columns (who reported whom,
//     the reliability signal, escalation flags, referral bookkeeping);
//   - admin token only in a header, dev routes need a session or the admin
//     token, logout ends the session, body-size and malformed-JSON handling;
//   - real calendar dates, field limits, contact info kept out of partner-
//     visible profile fields, request/age-range/cause validation;
//   - admin can pause and clear a user's matching;
//   - a second server run with rate limiting on and a too-short admin token.
// Own server on :3050, own throwaway database.
const h = require('./test-helpers');

h.useTempDb('authz');
const { check, api, BASE, ADMIN_TOKEN } = h;

async function raw(pathname, { method = 'POST', headers = {}, body } = {}) {
  const response = await fetch(`${BASE}${pathname}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function main() {
  let { server } = await h.startServer();
  const db = require('./db');
  const { INTERNAL_USER_COLUMNS } = require('./lib/serialize');
  try {
    // ── 1. Every volunteer route needs a session ──
    const { router } = require('./routes/volunteer');
    const routes = router.stack.filter((layer) => layer.route).flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route.path.replace(/:id/g, 'nope') })));
    const open = [];
    for (const r of routes) {
      const res = await api(r.path, { method: r.method, body: r.method === 'GET' ? undefined : {} });
      if (res.status !== 401) open.push(`${r.method} ${r.path} → ${res.status}`);
    }
    check(`all ${routes.length} volunteer routes reject a missing token with 401`, open.length === 0, open);

    // ── A pairing between A and B, plus an outsider C ──
    const org = await h.makeOrg({ mission_tags: ['Animal welfare'] });
    const shift = await h.makeShift(org, { daysAhead: 3 });
    const a = await h.makeVolunteer({ name: 'Ana', deeds: 5, doc: 'AUTHZ-DOC-A' });
    const b = await h.makeVolunteer({ name: 'Ben', deeds: 5, doc: 'AUTHZ-DOC-B' });
    const c = await h.makeVolunteer({ name: 'Cat', deeds: 5 });
    await h.startLooking(a);
    await h.startLooking(b);
    const pid = await h.proposalFor(a);
    await h.confirmPairing(a, pid);
    await h.confirmPairing(b, pid);
    const aBooking = db.prepare('SELECT id FROM bookings WHERE user_id = ? AND pairing_id = ?').get(a.id, pid).id;

    // ── 2. Cross-account access returns 404 and leaks nothing ──
    const probes = [
      ['GET', `/pairings/${pid}`], ['POST', `/pairings/${pid}/confirm`], ['POST', `/pairings/${pid}/decline`],
      ['GET', `/pairings/${pid}/messages`], ['POST', `/pairings/${pid}/messages`, { body: 'hi' }], ['GET', `/pairings/${pid}/share-plan`],
      ['POST', `/pairings/${pid}/contact-share`, { opt_in: true }], ['POST', `/pairings/${pid}/bail-decision`, { choice: 'release' }],
      ['GET', `/bookings/${aBooking}`], ['GET', `/bookings/${aBooking}/cancel-preview`], ['POST', `/bookings/${aBooking}/cancel`],
      ['GET', `/bookings/${aBooking}/rating-form`], ['POST', `/bookings/${aBooking}/ratings`, { org_operational: 5, personal_fit: 5 }],
      ['POST', `/bookings/${aBooking}/org-rating-visibility`, { public: true }], ['GET', `/matching/partner-badge?pairing_id=${pid}`],
    ];
    const leaks = [];
    for (const [method, path, body] of probes) {
      const res = await api(path, { method, token: c.token, body: method === 'GET' ? undefined : body ?? {} });
      if (res.status !== 404 || JSON.stringify(res.body).includes(a.id) || JSON.stringify(res.body).includes('Ana')) leaks.push(`${method} ${path} → ${res.status}`);
    }
    check(`an outsider gets 404 on all ${probes.length} pairing/booking routes, with nothing leaked`, leaks.length === 0, leaks);
    check("…and the pairing is unchanged", db.prepare('SELECT status FROM pairings WHERE id = ?').get(pid).status === 'confirmed');

    // ── 3. Org routes ──
    const volOnOrg = await api('/orgs/mine/shifts', { token: a.token });
    check('a volunteer token on /orgs/mine/* is 403', volOnOrg.status === 403);
    const orgB = await h.makeOrg({ mission_tags: ['Elder care'] });
    const orgProbes = [
      ['GET', `/orgs/mine/shifts/${shift.id}/roster`], ['POST', `/orgs/mine/bookings/${aBooking}/check-in`],
      ['POST', `/orgs/mine/bookings/${aBooking}/no-show`], ['POST', `/orgs/mine/bookings/${aBooking}/rate`, { attendance: 1, contribution: 1 }],
    ];
    const orgLeaks = [];
    for (const [method, path, body] of orgProbes) {
      const res = await api(path, { method, token: orgB.token, body: method === 'GET' ? undefined : body ?? {} });
      if (res.status !== 404) orgLeaks.push(`${method} ${path} → ${res.status}`);
    }
    check("one org can't read or act on another org's shift or bookings", orgLeaks.length === 0, orgLeaks);

    // ── 4. Response shape: no internal columns, the reporter is not revealed ──
    await api('/safety/reports', { method: 'POST', token: a.token, body: { category: 'other', pairing_id: pid } });
    const responses = [];
    for (const [v, doc, name] of [[a, 'AUTHZ-DOC-A', 'Ana'], [b, 'AUTHZ-DOC-B', 'Ben']]) {
      responses.push(await api('/users', { method: 'POST', token: v.token, body: { first_name: name, age: 27, gender: 'Female', hobbies: 'hiking' } }));
      responses.push(await api('/users/me', { token: v.token }));
      responses.push(await api('/users/me', { method: 'PATCH', token: v.token, body: { location_city: 'San Jose, CA' } }));
      await api('/verification/document-check', { method: 'POST', token: v.token, body: { document_type: 'passport', issuing_country: 'US', document_number: doc } });
      responses.push(await api('/verification/attest', { method: 'POST', token: v.token, body: { name_match: true, dob_match: true, doc_type_confirmed: true, expiry_date: '2035-01-01' } }));
      responses.push(await api('/deeds/purchase', { method: 'POST', token: v.token, body: { deeds: 5 } }));
    }
    const badShape = responses.filter((r) => r.status >= 400 || Object.keys(r.body).some((k) => INTERNAL_USER_COLUMNS.includes(k)));
    check('profile responses never include internal columns (10 responses)', badShape.length === 0, badShape.map((r) => [r.status, Object.keys(r.body)]));
    check("…and B can't find A's id anywhere in their own responses", responses.slice(5).every((r) => !JSON.stringify(r.body).includes(a.id)));
    check('the Deeds purchase response is just the balances', Object.keys(responses[4].body).sort().join() === 'balances,deeds_balance');

    // ── 5. Admin and dev routes, logout, body handling ──
    check('the admin token in the query string is refused', (await api(`/admin/orgs?admin_token=${ADMIN_TOKEN}`)).status === 403);
    check('the admin token in the header works', (await api('/admin/orgs', { admin: true })).status === 200);
    check('/admin is served no-store', (await fetch(`${BASE}/admin`)).headers.get('cache-control') === 'no-store');
    check('dev clock without credentials is refused', (await raw('/dev/clock/advance', { body: '{"hours":1}' })).status === 401);
    check('…with a session it works', (await api('/dev/clock', { token: c.token })).status === 200);
    check('…and with the admin token', (await api('/dev/tick', { method: 'POST', admin: true })).status === 200);
    const logout = await api('/auth/logout', { method: 'POST', token: c.token });
    check('logout ends the session server-side', logout.status === 200 && (await api('/users/me', { token: c.token })).status === 401);
    const huge = await api(`/pairings/${pid}/messages`, { method: 'POST', token: b.token, body: { body: 'x'.repeat(200 * 1024) } });
    check('a 200 KB request body is rejected with 413', huge.status === 413, huge.status);
    check('a malformed JSON body is a 400, not a 500', (await raw('/auth/login', { body: '{"email": ' })).status === 400);
    const waiver = await api('/orgs/mine/waiver', { method: 'POST', token: org.token, body: { mime: 'image/png', data_base64: Buffer.alloc(700 * 1024, 1).toString('base64') } });
    check('a ~1 MB waiver upload still works', waiver.status === 200 && waiver.body.waiver?.kind === 'uploaded', waiver.status);

    // ── 6. Validation ──
    const d = await h.makeVolunteer({ name: 'Dee', deeds: 5 });
    const v = [];
    const expect = async (label, res, status) => { if (res.status !== status) v.push(`${label}: ${res.status} ${JSON.stringify(res.body)}`); };
    await expect('impossible window date', await api('/requests', { method: 'POST', token: d.token, body: { window_start: '2026-02-30', window_end: '2026-03-02' } }), 400);
    await expect('impossible shift date', await api('/orgs/mine/shifts', { method: 'POST', token: org.token, body: { title: 'x', cause_tags: ['Animal welfare'], date: '2026-13-45', start_time: '09:00', end_time: '10:00', capacity: 2 } }), 400);
    await expect('impossible PATCH date', await api('/users/me', { method: 'PATCH', token: d.token, body: { availability_window_start: '2026-02-31' } }), 400);
    await expect('reversed PATCH window', await api('/users/me', { method: 'PATCH', token: d.token, body: { availability_window_start: '2030-05-10', availability_window_end: '2030-05-01' } }), 400);
    await expect('long first name', await api('/users', { method: 'POST', token: d.token, body: { first_name: 'x'.repeat(41), age: 27, gender: 'Female' } }), 400);
    await expect('long blurb', await api('/users', { method: 'POST', token: d.token, body: { first_name: 'Dee', age: 27, gender: 'Female', blurb: 'x'.repeat(301) } }), 400);
    await expect('too many hobbies', await api('/users', { method: 'POST', token: d.token, body: { first_name: 'Dee', age: 27, gender: 'Female', hobbies: 'a,b,c,d,e,f' } }), 400);
    await expect('phone number in blurb', await api('/users', { method: 'POST', token: d.token, body: { first_name: 'Dee', age: 27, gender: 'Female', blurb: 'text me 408 555 0199' } }), 422);
    await expect('handle in occupation', await api('/users', { method: 'POST', token: d.token, body: { first_name: 'Dee', age: 27, gender: 'Female', occupation: 'insta: dee_vols' } }), 422);
    await expect('unknown cause tag', await api('/users/me', { method: 'PATCH', token: d.token, body: { cause_tags: ['Animal welfare', 'Knitting'] } }), 400);
    await expect('radius out of range', await api('/users/me', { method: 'PATCH', token: d.token, body: { travel_radius_miles: 500 } }), 400);
    await expect('latitude out of range', await api('/users/me', { method: 'PATCH', token: d.token, body: { location_lat: 200 } }), 400);
    await expect('unknown frequency', await api('/users/me', { method: 'PATCH', token: d.token, body: { volunteering_frequency: 'Every minute' } }), 400);
    await expect('reversed age range', await api('/requests', { method: 'POST', token: d.token, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(6), age_min: 40, age_max: 25 } }), 400);
    await expect('non-numeric age', await api('/requests', { method: 'POST', token: d.token, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(6), age_min: 'old' } }), 400);
    await expect('org website without http', await api('/orgs', { method: 'POST', token: (await api('/auth/signup', { method: 'POST', body: { email: `org-v-${Date.now()}@example.com`, password: 'testpassword1', kind: 'org' } })).body.session_token, body: { name: 'V Org', mission_tags: ['Elder care'], website: 'javascript:alert(1)' } }), 400);
    const objOrgToken = (await api('/auth/signup', { method: 'POST', body: { email: `org-o-${Date.now()}@example.com`, password: 'testpassword1', kind: 'org' } })).body.session_token;
    await expect('object as org description (400, not 500)', await api('/orgs', { method: 'POST', token: objOrgToken, body: { name: 'O Org', mission_tags: ['Elder care'], description: { evil: true } } }), 400);
    const okReq = await api('/requests', { method: 'POST', token: d.token, body: { window_start: await h.serverDate(1), window_end: await h.serverDate(6) } });
    await expect('a valid request still works', okReq, 201);
    await expect('adding an unknown cause to a search', await api('/requests/current/adjust', { method: 'POST', token: d.token, body: { add_cause: 'Knitting' } }), 400);
    await api('/requests/current/cancel', { method: 'POST', token: d.token });
    await api(`/shifts/${shift.id}/rsvp-solo`, { method: 'POST', token: d.token });
    await expect('adjusting a solo-RSVP search', await api('/requests/current/adjust', { method: 'POST', token: d.token, body: { travel_radius_miles: 30 } }), 409);
    check('validation: every bad input is rejected with the right status', v.length === 0, v);

    // ── 7. Admin can pause and clear a user's matching ──
    const e = await h.makeVolunteer({ name: 'Eve', deeds: 5 });
    await api(`/admin/users/${e.id}/suspend`, { method: 'POST', admin: true });
    const paused = await h.home(e);
    const pausedReq = await h.startLooking(e);
    check('a suspended user sees the review block and cannot search', paused.matching_block?.code === 'account_review' && pausedReq.status === 409 && pausedReq.body.code === 'account_review');
    check('…with neutral copy', !/missed/i.test(pausedReq.body.error));
    await api(`/admin/users/${e.id}/clear-review`, { method: 'POST', admin: true });
    check('clearing the review restores matching', (await h.startLooking(e)).status === 201);

    // ── 8. Second run: rate limiting on, admin token too short ──
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    ({ server } = await h.startServer({ RATE_LIMIT: 'on', ADMIN_TOKEN: 'short' }));
    check('a too-short ADMIN_TOKEN disables admin routes', (await raw('/admin/orgs', { method: 'GET', headers: { 'X-Admin-Token': 'short' } })).status === 503);
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong-password' } })).status);
    check('the 11th failed login in a window is rate limited (429)', statuses.slice(0, 10).every((s) => s === 401) && statuses[10] === 429, statuses);
    const limited = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: 'x' }) });
    check('…with a Retry-After header', limited.status === 429 && Number(limited.headers.get('retry-after')) > 0);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});
