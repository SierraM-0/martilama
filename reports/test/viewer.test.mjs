import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleViewer } from '../src/viewer.js';
import { newId } from '../src/ingest.js';
import { fakeBucket, gzip } from '../testing/fakes.mjs';

const BASE = 'https://reports.martilama.com';
const EVENTS = JSON.stringify({ version: 1, events: [{ type: 4, timestamp: 1000 }] });

async function seed(bucket, { now, note = 'a note', withEvents = true } = {}) {
  const id = newId(now, 'abcdef01');
  const meta = {
    id, note, url: 'https://martilama.com/blog', viewport: { width: 1280, height: 720 },
    userAgent: 'test-agent', startedAt: now - 185000, endedAt: now, receivedAt: now,
  };
  if (withEvents) await bucket.put(`reports/${id}/events.json.gz`, await gzip(EVENTS));
  await bucket.put(`reports/${id}/meta.json`, JSON.stringify(meta));
  return id;
}
const env = () => ({ REPORTS: fakeBucket(), ALLOWED_ORIGINS: 'https://martilama.com' });
const get = (path, e, init) => handleViewer(new Request(BASE + path, init), e);

test('list shows newest first with duration and escaped note', async () => {
  const e = env();
  const older = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'first' });
  const newer = await seed(e.REPORTS, { now: 1_700_000_500_000, note: '<script>alert(1)</script>' });
  const res = await get('/', e);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /text\/html/);
  assert.match(res.headers.get('Content-Security-Policy'), /default-src 'none'/);
  const html = await res.text();
  assert.ok(html.indexOf(`/r/${newer}`) < html.indexOf(`/r/${older}`));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('3:05'));
});

test('empty list renders', async () => {
  const html = await (await get('/', env())).text();
  assert.ok(html.includes('No reports yet.'));
});

test('list skips a meta object that is not valid JSON', async () => {
  const e = env();
  const good = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  await e.REPORTS.put('reports/0000000000001-deadbeef/meta.json', '{broken');
  const res = await get('/', e);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(`/r/${good}`));
});

test('report page carries the data the viewer script needs', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'it "broke" <here>' });
  const html = await (await get(`/r/${id}`, e)).text();
  assert.ok(html.includes(`data-id="${id}"`));
  assert.ok(html.includes('data-vw="1280"') && html.includes('data-vh="720"'));
  assert.ok(html.includes('it &quot;broke&quot; &lt;here&gt;'));
  for (const s of ['id="player"', 'id="log"', 'id="delete"', '/vendor/rrweb-player.min.js', '/entries.js', '/viewer.js']) {
    assert.ok(html.includes(s), s);
  }
});

test('events API returns the decompressed JSON', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const res = await get(`/api/reports/${id}/events`, e);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), JSON.parse(EVENTS));
});

test('missing report: page and events answer 404', async () => {
  const e = env();
  const gone = newId(1_700_000_000_000, 'abcdef01');
  assert.equal((await get(`/r/${gone}`, e)).status, 404);
  assert.equal((await get(`/api/reports/${gone}/events`, e)).status, 404);
  const metaOnly = await seed(e.REPORTS, { now: 1_700_000_900_000, withEvents: false });
  assert.equal((await get(`/api/reports/${metaOnly}/events`, e)).status, 404);
});

test('malformed ids and unknown paths answer 404', async () => {
  const e = env();
  for (const p of ['/r/..%2F..%2Fsecret', '/r/abc', '/api/reports/abc/events', '/nope']) {
    assert.equal((await get(p, e)).status, 404, p);
  }
});

test('delete removes both objects; cross-origin delete is refused', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const cross = await get(`/api/reports/${id}`, e, { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  assert.equal(e.REPORTS.keys().length, 2);
  const ok = await get(`/api/reports/${id}`, e, { method: 'DELETE', headers: { Origin: BASE } });
  assert.equal(ok.status, 204);
  assert.deepEqual(e.REPORTS.keys(), []);
});

test('entry point: /ingest is public, everything else needs Access', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  for (const p of ['/', `/r/${id}`, `/api/reports/${id}/events`]) {
    assert.equal((await worker.fetch(new Request(BASE + p), e)).status, 403, p);
  }
  const del = await worker.fetch(new Request(`${BASE}/api/reports/${id}`, { method: 'DELETE' }), e);
  assert.equal(del.status, 403);
  assert.equal(e.REPORTS.keys().length, 2);
  const ingest = await worker.fetch(new Request(`${BASE}/ingest`, { method: 'GET', headers: { Origin: 'https://martilama.com' } }), e);
  assert.equal(ingest.status, 405);
});

test('report page links to the newer and older report and shows its position', async () => {
  const e = env();
  const oldest = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const middle = await seed(e.REPORTS, { now: 1_700_000_500_000 });
  const newest = await seed(e.REPORTS, { now: 1_700_000_900_000 });
  const html = await (await get(`/r/${middle}`, e)).text();
  assert.ok(html.includes(`<a id="newer" href="/r/${newest}"`), 'newer link');
  assert.ok(html.includes(`<a id="older" href="/r/${oldest}"`), 'older link');
  assert.ok(html.includes('2 of 3'));
});

test('the newest and oldest reports have no link past the end', async () => {
  const e = env();
  const oldest = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const newest = await seed(e.REPORTS, { now: 1_700_000_900_000 });
  const first = await (await get(`/r/${newest}`, e)).text();
  assert.ok(!first.includes('<a id="newer"') && first.includes(`<a id="older" href="/r/${oldest}"`));
  assert.ok(first.includes('1 of 2'));
  const last = await (await get(`/r/${oldest}`, e)).text();
  assert.ok(last.includes(`<a id="newer" href="/r/${newest}"`) && !last.includes('<a id="older"'));
});

test('a lone report still renders, as 1 of 1', async () => {
  const e = env();
  const only = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${only}`, e)).text();
  assert.ok(html.includes('1 of 1'));
  assert.ok(!html.includes('<a id="newer"') && !html.includes('<a id="older"'));
});

test('report page has the marker strip and the console filters', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${id}`, e)).text();
  for (const s of ['id="marks"', 'id="filters"', 'data-filter="error"', 'data-filter="warning"', 'data-filter="log"', 'data-filter="nav"']) {
    assert.ok(html.includes(s), s);
  }
});
