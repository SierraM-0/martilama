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

test('report page has the console filters', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${id}`, e)).text();
  for (const s of ['id="filters"', 'data-filter="error"', 'data-filter="warning"', 'data-filter="log"', 'data-filter="nav"']) {
    assert.ok(html.includes(s), s);
  }
});

test('the list page carries the site logo and name', async () => {
  const html = await (await get('/', env())).text();
  assert.match(html, /<svg[^>]*class="logo"/);
  assert.ok(html.includes('martilama'));
});

test('pages may load fonts from the viewer itself', async () => {
  const csp = (await get('/', env())).headers.get('Content-Security-Policy');
  assert.match(csp, /font-src 'self'/);
});

test('newer and older are marked up as buttons, with a disabled look at the ends', async () => {
  const e = env();
  const oldest = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const newest = await seed(e.REPORTS, { now: 1_700_000_900_000 });
  const html = await (await get(`/r/${newest}`, e)).text();
  assert.ok(html.includes(`<a id="older" href="/r/${oldest}" class="btn">`));
  assert.ok(html.includes('<span class="btn off" aria-disabled="true">Newer</span>'));
});

test('each list row is one link wrapping the date, page, note and length', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'whole row' });
  const html = await (await get('/', e)).text();
  const row = html.match(new RegExp(`<a class="row" href="/r/${id}">([\\s\\S]*?)</a>`));
  assert.ok(row, 'row link');
  for (const part of ['2023-11-14 22:13 UTC', '/blog', 'whole row', '3:05']) assert.ok(row[1].includes(part), part);
  assert.ok(!row[1].includes('<a '), 'no nested link');
});

test('report details are a labelled list, one detail per row', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${id}`, e)).text();
  const dl = html.match(/<dl class="facts">([\s\S]*?)<\/dl>/);
  assert.ok(dl, 'facts list');
  const labels = [...dl[1].matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Received', 'Page', 'Length', 'Window', 'Browser']);
  for (const v of ['2023-11-14 22:13 UTC', 'https://martilama.com/blog', '3:05', '1280 × 720', 'test-agent']) {
    assert.ok(dl[1].includes(`<dd>${v}</dd>`), v);
  }
});

test('report page has a draggable divider between the replay and the console', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${id}`, e)).text();
  const main = html.indexOf('<div class="main">');
  const divider = html.indexOf('<div id="divider" class="divider" role="separator" aria-orientation="vertical"');
  const side = html.indexOf('<aside class="side">');
  assert.ok(main > 0 && divider > main && side > divider, `order: ${main} ${divider} ${side}`);
  assert.match(html, /id="divider"[^>]*tabindex="0"/);
  assert.match(html, /id="divider"[^>]*aria-label="Resize replay and console"/);
});

test('details are collapsed until asked for, and still complete', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000 });
  const html = await (await get(`/r/${id}`, e)).text();
  const block = html.match(/<details id="details"[^>]*>([\s\S]*?)<\/details>/);
  assert.ok(block, 'details element');
  assert.ok(!/<details id="details"[^>]*\bopen\b/.test(html), 'closed by default');
  assert.match(block[1], /<summary[^>]*>Details<\/summary>/);
  assert.ok(block[1].includes('<dl class="facts">') && block[1].includes('<dd>test-agent</dd>'));
});

test("the visitor's note sits below the replay and above the key hints", async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000, note: 'note <placement>' });
  const html = await (await get(`/r/${id}`, e)).text();
  const player = html.indexOf('id="player"');
  const note = html.indexOf('<p class="note" id="note">note &lt;placement&gt;</p>');
  const keys = html.indexOf('<p class="keys">');
  assert.ok(player > 0 && note > player && keys > note, `order: ${player} ${note} ${keys}`);
  assert.equal(html.split('note &lt;placement&gt;').length - 1, 1, 'note appears once');
});

test('a report without a note says so in the same place', async () => {
  const e = env();
  const id = await seed(e.REPORTS, { now: 1_700_000_000_000, note: '' });
  const html = await (await get(`/r/${id}`, e)).text();
  assert.ok(html.includes('<p class="note" id="note"><em>The visitor left no note.</em></p>'));
});
