// ID verification hardening over HTTP (own throwaway database, server on
// :3050 — see test-helpers.js): the under-age refusal (false or any non-true value), the required adulthood answer, stable error
// codes on the document-check/attest rejections, and the guarantee that a
// rejected attempt leaves the account unverified and does not block a later
// correct attempt by the same account.
const h = require('./test-helpers');
const rules = require('./lib/rules');

h.useTempDb('id-checks');
const { check, api } = h;

const GOOD = { name_match: true, dob_match: true, doc_type_confirmed: true, dob_is_adult: true, expiry_date: '2035-01-01' };

async function main() {
  const { server } = await h.startServer();
  try {
    const db = require('./db');
    const stateOf = (vol) => ({
      verified: db.prepare('SELECT verified FROM users WHERE id = ?').get(vol.id).verified,
      badges: db.prepare('SELECT COUNT(*) AS n FROM badges WHERE subject_id = ?').get(vol.id).n,
    });
    const docCheck = (vol, doc) => api('/verification/document-check', {
      method: 'POST', token: vol.token,
      body: { document_type: 'passport', issuing_country: 'US', document_number: doc },
    });
    const attest = (vol, body) => api('/verification/attest', { method: 'POST', token: vol.token, body });

    // ── A minor's document is refused, and nothing is issued ──
    const minor = await h.makeVolunteer({ prefix: 'minor', verify: false });
    const minorDoc = `IDC-M-${Date.now().toString(36)}`;
    check('document-check on a fresh document is accepted', (await docCheck(minor, minorDoc)).body?.duplicate === false);
    const underage = await attest(minor, { ...GOOD, dob_is_adult: false });
    check('dob_is_adult false is rejected with 400 underage_document',
      underage.status === 400 && underage.body?.code === 'underage_document', underage.body);
    check('the underage rejection keeps a readable error message', typeof underage.body?.error === 'string' && underage.body.error.length > 0);
    const afterMinor = stateOf(minor);
    check('a rejected underage attest leaves the account unverified with no badge', afterMinor.verified === 0 && afterMinor.badges === 0, afterMinor);
    const minorMe = await api('/users/me', { token: minor.token });
    check('the profile reads as unverified after the underage rejection', !minorMe.body?.verified, minorMe.body?.verified);

    // Anything present that isn't exactly true is refused as underage.
    for (const [label, value] of [['the string "false"', 'false'], ['0', 0], ['the string "true"', 'true']]) {
      const odd = await attest(minor, { ...GOOD, dob_is_adult: value });
      check(`dob_is_adult as ${label} is rejected with 400 underage_document`,
        odd.status === 400 && odd.body?.code === 'underage_document', odd.body);
    }
    const afterOdd = stateOf(minor);
    check('the non-boolean rejections leave the account unverified with no badge', afterOdd.verified === 0 && afterOdd.badges === 0, afterOdd);

    // The adulthood answer is required: a missing or null answer is refused with its own code.
    const noAnswer = { ...GOOD };
    delete noAnswer.dob_is_adult;
    const missingAnswer = await attest(minor, noAnswer);
    check('a missing adulthood answer is refused with 400 adult_answer_required',
      missingAnswer.status === 400 && missingAnswer.body?.code === 'adult_answer_required', missingAnswer.body);
    check('the missing-answer refusal keeps a readable error message',
      typeof missingAnswer.body?.error === 'string' && missingAnswer.body.error.length > 0);
    const nullAnswer = await attest(minor, { ...GOOD, dob_is_adult: null });
    check('a null adulthood answer is refused with 400 adult_answer_required',
      nullAnswer.status === 400 && nullAnswer.body?.code === 'adult_answer_required', nullAnswer.body);
    const afterMissing = stateOf(minor);
    check('the missing-answer refusals leave the account unverified with no badge', afterMissing.verified === 0 && afterMissing.badges === 0, afterMissing);

    // ── The same account can still complete a correct attempt afterwards ──
    const retry = await attest(minor, GOOD);
    check('an explicit true adulthood answer is accepted, so a correct attempt after the rejection verifies the same account',
      retry.status === 200 && retry.body?.verified, { status: retry.status, body: retry.body });
    const verifiedMinor = stateOf(minor);
    check('the correct attempt creates exactly one badge', verifiedMinor.verified === 1 && verifiedMinor.badges === 1, verifiedMinor);

    // ── Other rejections carry stable codes and also leave the user unverified ──
    const vol = await h.makeVolunteer({ prefix: 'idc', verify: false });
    const volDoc = `IDC-V-${Date.now().toString(36)}`;

    const noCheck = await attest(vol, GOOD);
    check('attest without a document-check is 400 with a code',
      noCheck.status === 400 && noCheck.body?.code === 'no_recent_document_check', noCheck.body);

    await docCheck(vol, volDoc);

    const expired = await attest(vol, { ...GOOD, expiry_date: '2001-01-01' });
    check('an expired date is 400 with a code', expired.status === 400 && expired.body?.code === 'document_expired', expired.body);
    const today = await attest(vol, { ...GOOD, expiry_date: await h.serverDate(0) });
    check('an expiry that is already past or today is rejected with a code', today.status === 400 && Boolean(today.body?.code), today.body);
    const badDate = await attest(vol, { ...GOOD, expiry_date: '01/01/2035' });
    check('a malformed expiry is 400 with a code', badDate.status === 400 && badDate.body?.code === 'invalid_expiry_date', badDate.body);

    for (const field of ['name_match', 'dob_match', 'doc_type_confirmed']) {
      for (const bad of [false, 'true', 1, null]) {
        const res = await attest(vol, { ...GOOD, [field]: bad });
        check(`${field} = ${JSON.stringify(bad)} is 400 with code ${field}_not_true`,
          res.status === 400 && res.body?.code === `${field}_not_true`, res.body);
      }
      const missing = { ...GOOD };
      delete missing[field];
      const res = await attest(vol, missing);
      check(`a missing ${field} is 400 with a code`, res.status === 400 && res.body?.code === `${field}_not_true`, res.body);
    }

    const stateAfterRejections = stateOf(vol);
    check('none of those rejections verified the account or issued a badge',
      stateAfterRejections.verified === 0 && stateAfterRejections.badges === 0, stateAfterRejections);

    const volRetry = await attest(vol, GOOD);
    check('after many rejections, a correct attempt by the same account still verifies',
      volRetry.status === 200 && volRetry.body?.verified, { status: volRetry.status, body: volRetry.body });

    // ── document-check validation carries a code too ──
    const bad = await api('/verification/document-check', { method: 'POST', token: vol.token, body: { document_type: 'passport' } });
    check('document-check with missing fields is 400 with a code', bad.status === 400 && bad.body?.code === 'invalid_document_fields', bad.body);
    const badType = await api('/verification/document-check', {
      method: 'POST', token: vol.token, body: { document_type: 'pass:port', issuing_country: 'US', document_number: 'X123456' },
    });
    check('document-check rejecting a bad document type is 400 with a code', badType.status === 400 && badType.body?.code === 'invalid_document_fields', badType.body);

    // ── Only ID document types are accepted ──
    let refusedBody = null;
    for (const t of ['transit_card', 'student_id', 'Library Card']) {
      const r = await api('/verification/document-check', {
        method: 'POST', token: vol.token, body: { document_type: t, issuing_country: 'US', document_number: 'X123456' },
      });
      check(`a ${t} document type is refused with the static error`,
        r.status === 400 && r.body?.code === 'invalid_document_fields' && !JSON.stringify(r.body).includes(t), r.body);
      refusedBody = refusedBody ?? r.body;
    }
    for (const t of [...rules.ACCEPTED_DOCUMENT_TYPES, '  Drivers_License ']) {
      const acc = await h.makeVolunteer({ prefix: 'dtype', verify: false });
      const r = await api('/verification/document-check', {
        method: 'POST', token: acc.token, body: { document_type: t, issuing_country: 'US', document_number: `DT${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` },
      });
      check(`document type "${t}" passes document-check`, r.status === 200 && r.body?.duplicate === false, r.body);
    }

    // ── A non-US document-number shape is accepted as typed ──
    const foreign = await h.makeVolunteer({ prefix: 'foreign', verify: false });
    const foreignCheck = await api('/verification/document-check', {
      method: 'POST', token: foreign.token,
      body: { document_type: 'drivers_license', issuing_country: 'GB', document_number: `MORGA 657054 SM9IJ ${Date.now().toString(36)}` },
    });
    check('a non-US document-number shape passes document-check', foreignCheck.status === 200 && foreignCheck.body?.duplicate === false, foreignCheck.body);
    const foreignAttest = await attest(foreign, GOOD);
    check('and that account verifies', foreignAttest.status === 200 && foreignAttest.body?.verified, foreignAttest.body);

    // ── A second account cannot reuse a verified document (code on the 200 duplicate flag is unchanged) ──
    const copycat = await h.makeVolunteer({ prefix: 'copy', verify: false });
    const dup = await docCheck(copycat, minorDoc);
    check('a document already used by another account reports duplicate', dup.status === 200 && dup.body?.duplicate === true, dup.body);
    const copycatAttest = await attest(copycat, GOOD);
    check('and the duplicate account cannot attest without a staged check',
      copycatAttest.status === 400 && copycatAttest.body?.code === 'no_recent_document_check', copycatAttest.body);
    check('the duplicate account stays unverified with no badge', stateOf(copycat).verified === 0 && stateOf(copycat).badges === 0, stateOf(copycat));

    // ── Two optional profile fields saved through PATCH /users/me ──
    const prof = await h.makeVolunteer({ prefix: 'prof', verify: false });
    const patch = (body) => api('/users/me', { method: 'PATCH', token: prof.token, body });
    const okDays = await patch({ availability_weekdays: [6, 0, 3] });
    check('availability_weekdays accepts unique day numbers and is returned as JSON text',
      okDays.status === 200 && JSON.parse(okDays.body.availability_weekdays).join() === '0,3,6', okDays.body);
    check('GET /users/me returns the saved weekdays', JSON.parse((await api('/users/me', { token: prof.token })).body.availability_weekdays).join() === '0,3,6');
    for (const [label, value] of [['a repeated day', [1, 1]], ['a day above 6', [7]], ['a negative day', [-1]], ['a non-integer day', [1.5]], ['a string day', ['1']], ['a non-list', 3]]) {
      const res = await patch({ availability_weekdays: value });
      check(`availability_weekdays with ${label} is 400 invalid_weekdays`, res.status === 400 && res.body?.code === 'invalid_weekdays', res.body);
    }
    check('a rejected weekdays value leaves the saved one untouched', JSON.parse((await api('/users/me', { token: prof.token })).body.availability_weekdays).join() === '0,3,6');
    for (const [label, value] of [['an empty list', []], ['null', null]]) {
      const res = await patch({ availability_weekdays: value });
      check(`availability_weekdays as ${label} clears it to any day`, res.status === 200 && res.body.availability_weekdays === null, res.body);
    }
    for (const [value, stored] of [[true, 1], [false, 0], [null, null]]) {
      const res = await patch({ prospective_org_ok_nearest: value });
      check(`prospective_org_ok_nearest ${value} is stored as ${stored}`, res.status === 200 && res.body.prospective_org_ok_nearest === stored, res.body);
    }
    const badNearest = await patch({ prospective_org_ok_nearest: 'yes' });
    check('prospective_org_ok_nearest rejects a non-boolean', badNearest.status === 400, badNearest.body);
  } finally {
    h.cleanup(server);
  }
  h.summary();
}

main().catch((err) => { console.error(err); process.exit(1); });
