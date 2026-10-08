import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIngest, newId, MAX_BYTES } from '../src/ingest.js';
import { fakeBucket, gzip, gunzip } from '../testing/fakes.mjs';

const SITE = 'https://martilama.com';
const EVENTS = JSON.stringify({ version: 1, events: [{ type: 4, timestamp: 1000 }] });
const env = (over = {}) => ({ REPORTS: fakeBucket(), ALLOWED_ORIGINS: SITE, ...over });
const goodMeta = (over = {}) => ({
  version: 1, note: 'nav broke', url: `${SITE}/blog`, viewport: { width: 1280, height: 720 },
  userAgent: 'test-agent', startedAt: 1000, endedAt: 181000, encoding: 'gzip', ...over,
});

async function req({ origin = SITE, meta = goodMeta(), events, method = 'POST', headers = {} } = {}) {
  const init = { method, headers: { Origin: origin, 'CF-Connecting-IP': '203.0.113.9', ...headers } };
  if (method === 'POST') {
    const form = new FormData();
    if (meta !== null) form.append('meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
    const bytes = events === undefined ? await gzip(EVENTS) : events;
    if (bytes !== null) form.append('events', new Blob([bytes]), 'events');
    init.body = form;
  }
  return new Request('https://reports.martilama.com/ingest', init);
}

test('stores a gzipped report as two objects and returns its id', async () => {
  const e = env();
  const res = await handleIngest(await req(), e);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  const { id } = await res.json();
  assert.match(id, /^\d{13}-[0-9a-f]{8}$/);
  assert.deepEqual(e.REPORTS.keys(), [`reports/${id}/events.json.gz`, `reports/${id}/meta.json`]);
  const stored = await (await e.REPORTS.get(`reports/${id}/events.json.gz`)).arrayBuffer();
  assert.equal(await gunzip(new Uint8Array(stored)), EVENTS);
});

test('stored meta has the note and page but no IP and no encoding', async () => {
  const e = env();
  const { id } = await (await handleIngest(await req(), e)).json();
  const meta = await (await e.REPORTS.get(`reports/${id}/meta.json`)).json();
  assert.equal(meta.id, id);
  assert.equal(meta.note, 'nav broke');
  assert.equal(meta.url, `${SITE}/blog`);
  assert.deepEqual(meta.viewport, { width: 1280, height: 720 });
  assert.equal(typeof meta.receivedAt, 'number');
  assert.ok(!JSON.stringify(meta).includes('203.0.113.9'));
  assert.equal(meta.encoding, undefined);
});

test('an uncompressed upload is gzipped before storage', async () => {
  const e = env();
  const r = await req({ meta: goodMeta({ encoding: 'identity' }), events: new TextEncoder().encode(EVENTS) });
  const { id } = await (await handleIngest(r, e)).json();
  const stored = await (await e.REPORTS.get(`reports/${id}/events.json.gz`)).arrayBuffer();
  assert.equal(await gunzip(new Uint8Array(stored)), EVENTS);
});

test('rejects other origins and missing origin', async () => {
  assert.equal((await handleIngest(await req({ origin: 'https://evil.example' }), env())).status, 403);
  const noOrigin = new Request('https://reports.martilama.com/ingest', { method: 'POST', body: 'x' });
  assert.equal((await handleIngest(noOrigin, env())).status, 403);
});

test('answers the CORS preflight', async () => {
  const res = await handleIngest(await req({ method: 'OPTIONS' }), env());
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
});

test('rejects other methods', async () => {
  assert.equal((await handleIngest(await req({ method: 'GET' }), env())).status, 405);
});

test('rate limit: keyed by IP, answers 429', async () => {
  let key;
  const limiter = { limit: async (o) => { key = o.key; return { success: false }; } };
  const e = env({ INGEST_LIMITER: limiter });
  const res = await handleIngest(await req(), e);
  assert.equal(res.status, 429);
  assert.equal(key, '203.0.113.9');
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('declared Content-Length over the cap is refused', async () => {
  const r = await req({ headers: { 'Content-Length': String(MAX_BYTES + 1) } });
  assert.equal((await handleIngest(r, env())).status, 413);
});

test('oversized body without Content-Length is refused and nothing is stored', async () => {
  const e = env();
  const r = await req({ events: new Uint8Array(MAX_BYTES + 1) });
  assert.equal(r.headers.get('Content-Length'), null);
  assert.equal((await handleIngest(r, e)).status, 413);
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('malformed: body is not multipart', async () => {
  const r = new Request('https://reports.martilama.com/ingest', {
    method: 'POST', body: 'hello', headers: { Origin: SITE, 'Content-Type': 'text/plain' },
  });
  assert.equal((await handleIngest(r, env())).status, 400);
});

test('malformed: missing parts, bad meta, bad gzip', async () => {
  const cases = [
    { meta: null },
    { events: null },
    { meta: '{not json' },
    { meta: goodMeta({ note: 'x'.repeat(1001) }) },
    { meta: goodMeta({ url: 'https://evil.example/' }) },
    { meta: goodMeta({ url: 'not a url' }) },
    { meta: goodMeta({ viewport: { width: 'wide', height: 1 } }) },
    { meta: goodMeta({ startedAt: 5, endedAt: 1 }) },
    { meta: goodMeta({ encoding: 'br' }) },
    { events: new TextEncoder().encode('not gzip') },
  ];
  for (const c of cases) {
    const e = env();
    const res = await handleIngest(await req(c), e);
    assert.equal(res.status, 400, JSON.stringify(c).slice(0, 80));
    assert.deepEqual(e.REPORTS.keys(), []);
  }
});

test('newId sorts newest first', () => {
  const older = newId(1_700_000_000_000, 'aaaaaaaa');
  const newer = newId(1_700_000_001_000, 'aaaaaaaa');
  assert.ok(newer < older);
  assert.match(older, /^\d{13}-aaaaaaaa$/);
});
