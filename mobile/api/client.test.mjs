// node --test mobile/api/client.test.mjs — api() error mapping and timeUntil,
// with fetch stubbed. The config import is replaced so no app runtime loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const source = raw.replace(/^import .*config\/api.*$/m, "const BACKEND_URL = 'http://backend.test';");
assert.notEqual(source, raw, 'config import line was not found');
const { api, timeUntil } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

function stubFetch(status, body, { badJson = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => { if (badJson) throw new Error('bad json'); return body; } };
  };
  return calls;
}

test('a successful call returns the parsed body and sends the bearer token', async () => {
  const calls = stubFetch(200, { ok: 1 });
  assert.deepEqual(await api('tok', '/x', { method: 'POST', body: { a: 1 } }), { ok: 1 });
  assert.equal(calls[0].url, 'http://backend.test/x');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.body, '{"a":1}');
});

test('no token means no Authorization header and no body', async () => {
  const calls = stubFetch(200, {});
  await api(null, '/x');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.body, undefined);
});

test('an error response throws with message, code, status and data', async () => {
  stubFetch(402, { error: 'Not enough Deeds.', code: 'insufficient_deeds', extra: 3 });
  await assert.rejects(api('t', '/x'), (err) => {
    assert.equal(err.message, 'Not enough Deeds.');
    assert.equal(err.code, 'insufficient_deeds');
    assert.equal(err.status, 402);
    assert.equal(err.data.extra, 3);
    return true;
  });
});

test('an error with an unreadable body falls back to a generic message', async () => {
  stubFetch(500, null, { badJson: true });
  await assert.rejects(api('t', '/x'), (err) => err.message === 'Something went wrong.' && err.status === 500 && err.code === undefined);
});

test('timeUntil formats minutes, hours and days, and clamps the past to now', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const at = (ms) => new Date(now + ms).toISOString();
  assert.equal(timeUntil(at(-1000), now), 'now');
  assert.equal(timeUntil(at(0), now), 'now');
  assert.equal(timeUntil(at(30 * 60000), now), '30 min');
  assert.equal(timeUntil(at(200 * 60000), now), '3h 20m');
  assert.equal(timeUntil(at(72 * 3600000), now), '3 days');
});
