import test from 'node:test';
import assert from 'node:assert/strict';

import places from '../api/places.js';
import placeHours from '../api/place-hours.js';
import reportIssue from '../api/report-issue.js';
import feedback from '../api/feedback.js';
import { escapeHtml, createRateLimiter, boundedNumber, clampStr } from '../lib/http.js';

let ipCounter = 0;
const nextIp = () => `10.0.0.${++ipCounter}`;

function call(handler, { method = 'GET', query = {}, body, ip = nextIp() } = {}) {
  const req = { method, query, body, headers: { 'x-forwarded-for': ip }, socket: {} };
  const res = {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end() { return this; },
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}

function mockFetch(responder) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return responder(String(url), init); };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });

const withEnv = async (vars, fn) => {
  const saved = {}; for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

// ---------------------------------------------------------------- helpers
test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
});
test('boundedNumber and clampStr', () => {
  assert.equal(boundedNumber('12.5', -90, 90), 12.5);
  assert.equal(boundedNumber('abc', -90, 90), null);
  assert.equal(boundedNumber(91, -90, 90), null);
  assert.equal(clampStr('  hello  ', 3), 'hel');
  assert.equal(clampStr(42, 5), '');
});
test('rate limiter blocks after max and sweeps stale keys', () => {
  const limited = createRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limited('a'), false); assert.equal(limited('a'), false); assert.equal(limited('a'), true);
  assert.equal(limited('b'), false);
});

// ---------------------------------------------------------------- places
test('places: rejects bad coordinates and wrong methods', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: 'k' }, async () => {
    assert.equal((await call(places, { query: { lat: 'x', lon: '77' } })).statusCode, 400);
    assert.equal((await call(places, { query: { lat: '12', lon: '999' } })).statusCode, 400);
    assert.equal((await call(places, { method: 'POST', query: { lat: '12', lon: '77' } })).statusCode, 405);
  });
});

test('places: asks Google for rankby=distance with no radius, drops permanently closed, flags the rest', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: 'secret-key' }, async () => {
    const m = mockFetch(() => json({ status: 'OK', results: [
      { place_id: 'A'.repeat(20), name: 'Near', geometry: { location: { lat: 1, lng: 2 } }, vicinity: 'Road', opening_hours: { open_now: true }, business_status: 'OPERATIONAL' },
      { place_id: 'B'.repeat(20), name: 'Gone', geometry: { location: { lat: 1, lng: 2 } }, business_status: 'CLOSED_PERMANENTLY' },
      { place_id: 'C'.repeat(20), name: 'Paused', geometry: { location: { lat: 1, lng: 2 } }, business_status: 'CLOSED_TEMPORARILY' },
    ] }));
    try {
      const res = await call(places, { query: { lat: '12.97', lon: '77.64', radius: '15000' } });
      const u = new URL(m.calls[0].url);
      assert.equal(u.searchParams.get('rankby'), 'distance');
      assert.equal(u.searchParams.get('type'), 'liquor_store');
      assert.equal(u.searchParams.has('radius'), false, 'radius is not allowed with rankby=distance');
      assert.equal(u.searchParams.get('location'), '12.97,77.64');
      assert.deepEqual(res.body.results.map((r) => r.name), ['Near', 'Paused']);
      assert.equal(res.body.results[0].openNow, true);
      assert.equal(res.body.results[1].businessStatus, 'CLOSED_TEMPORARILY');
      assert.equal(JSON.stringify(res.body).includes('secret-key'), false, 'key never leaves the server');
    } finally { m.restore(); }
  });
});

test('places: no API key returns an empty fallback instead of crashing', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: undefined }, async () => {
    const res = await call(places, { query: { lat: '12', lon: '77' } });
    assert.equal(res.statusCode, 503); assert.deepEqual(res.body.results, []);
  });
});

// ---------------------------------------------------------------- place-hours
test('place-hours: validates the id', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: 'k' }, async () => {
    assert.equal((await call(placeHours, { query: {} })).statusCode, 400);
    assert.equal((await call(placeHours, { query: { place_id: '../../etc/passwd' } })).statusCode, 400);
  });
});

test('place-hours: maps currentOpeningHours and caches at the edge', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: 'k' }, async () => {
    const m = mockFetch(() => json({ businessStatus: 'OPERATIONAL', utcOffsetMinutes: 330, currentOpeningHours: { openNow: true, nextCloseTime: '2026-11-17T16:30:00Z', periods: [{ big: 'ignored' }] } }));
    try {
      const res = await call(placeHours, { query: { place_id: 'ChIJ' + 'x'.repeat(20) } });
      assert.match(m.calls[0].url, /^https:\/\/places\.googleapis\.com\/v1\/places\/ChIJ/);
      assert.equal(m.calls[0].init.headers['X-Goog-FieldMask'], 'businessStatus,currentOpeningHours,utcOffsetMinutes');
      assert.deepEqual(res.body, { hours: { openNow: true, nextOpenTime: null, nextCloseTime: '2026-11-17T16:30:00Z' }, businessStatus: 'OPERATIONAL', utcOffsetMinutes: 330 });
      assert.match(res.headers['Cache-Control'], /s-maxage=300/);
    } finally { m.restore(); }
  });
});

test('place-hours: a place with no hours returns hours:null (client shows "Hours unavailable")', async () => {
  await withEnv({ GOOGLE_MAPS_API_KEY: 'k' }, async () => {
    const m = mockFetch(() => json({ businessStatus: 'OPERATIONAL' }));
    try { const res = await call(placeHours, { query: { place_id: 'ChIJ' + 'y'.repeat(20) } }); assert.equal(res.body.hours, null); }
    finally { m.restore(); }
  });
});

// ---------------------------------------------------------------- report-issue
test('report-issue: escapes user input in the email and caps lengths', async () => {
  await withEnv({ RESEND_API_KEY: 'rk', NOTIFICATION_EMAIL: 'owner@example.com', DATABASE_URL: undefined }, async () => {
    const m = mockFetch(() => json({ id: '1' }));
    try {
      const res = await call(reportIssue, { method: 'POST', body: { city: '<b>Delhi</b>', country: 'India', issueType: 'Broken\r\nBcc: x', description: '<script>alert(1)</script>\n' + 'x'.repeat(5000), lat: '28.6', lon: 'oops' } });
      assert.equal(res.statusCode, 200); assert.equal(res.body.emailStatus.sent, true);
      const payload = JSON.parse(m.calls[0].init.body);
      assert.equal(payload.to, 'owner@example.com');
      assert.equal(payload.html.includes('<script>'), false);
      assert.equal(payload.html.includes('&lt;script&gt;'), true);
      assert.equal(payload.html.includes('<b>Delhi</b>'), false);
      assert.equal(/[\r\n]/.test(payload.subject), false, 'no header injection through the subject');
      assert.ok(payload.html.length < 4000, 'description is length-capped');
    } finally { m.restore(); }
  });
});

test('report-issue: no NOTIFICATION_EMAIL means no email (and no hardcoded fallback address)', async () => {
  await withEnv({ RESEND_API_KEY: 'rk', NOTIFICATION_EMAIL: undefined, DATABASE_URL: undefined }, async () => {
    const m = mockFetch(() => json({}));
    try { const res = await call(reportIssue, { method: 'POST', body: { issueType: 'x' } }); assert.equal(m.calls.length, 0); assert.equal(res.body.emailStatus.sent, false); }
    finally { m.restore(); }
  });
});

test('report-issue: validates body and method', async () => {
  await withEnv({ DATABASE_URL: undefined, RESEND_API_KEY: undefined }, async () => {
    assert.equal((await call(reportIssue, { method: 'POST', body: undefined })).statusCode, 400);
    assert.equal((await call(reportIssue, { method: 'POST', body: { description: 'no type' } })).statusCode, 400);
    assert.equal((await call(reportIssue, { method: 'GET' })).statusCode, 405);
  });
});

// ---------------------------------------------------------------- feedback (in-memory mode)
test('feedback: validates input and keeps one vote per user per store', async () => {
  await withEnv({ DATABASE_URL: undefined }, async () => {
    assert.equal((await call(feedback, { method: 'POST', body: { store_id: 's1', status: 'maybe' } })).statusCode, 400);
    assert.equal((await call(feedback, { method: 'POST', body: { status: 'open' } })).statusCode, 400);
    assert.equal((await call(feedback, { method: 'GET', query: {} })).statusCode, 400);
    await call(feedback, { method: 'POST', body: { store_id: 's1', user_id: 'u1', status: 'open' } });
    await call(feedback, { method: 'POST', body: { store_id: 's1', user_id: 'u1', status: 'closed' } });
    await call(feedback, { method: 'POST', body: { store_id: 's1', user_id: 'u2', status: 'closed' } });
    const res = await call(feedback, { method: 'GET', query: { store_id: 's1' } });
    assert.equal(res.body.stats12h.totalCount, 2);
    assert.equal(res.body.stats12h.closedCount, 2, 'u1 changed their vote, not added a second one');
  });
});
